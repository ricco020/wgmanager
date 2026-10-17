"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, COOKIE_OPTIONS, currentUser, hashPassword, passwordAcceptable, signSession, verifyPassword } from "@/lib/auth";
import { encrypt, wgKeypair, wgPresharedKey, wgPublicKeyOf } from "@/lib/crypto";
import { db } from "@/lib/db";
import { FREE_LIMITS } from "@/lib/site";
import { cleanRef } from "@/lib/stats";
import { isPro } from "@/lib/stripe";
import { nextFreeIp, parseCidr, parseServerConf, validDns, validEndpoint } from "@/lib/wg";

export type ActionState = { error?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, signSession(userId), COOKIE_OPTIONS);
}

export async function signup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  if (!passwordAcceptable(password)) return { error: "Password must be at least 10 characters." };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "An account already exists for this email. Log in instead." };
  const ref = cleanRef((await cookies()).get("wg_ref")?.value);
  const user = await db.user.create({ data: { email, hash: hashPassword(password), ref: ref || null } });
  await setSession(user.id);
  redirect(next === "pro" ? "/pricing" : "/dashboard");
}

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  // Always run the hash check so an unknown email takes as long as a wrong password.
  const ok = verifyPassword(password, user?.hash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAA");
  if (!user || !ok) return { error: "Email or password is incorrect." };
  await setSession(user.id);
  redirect("/dashboard");
}

export async function createServer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const endpoint = String(form.get("endpoint") ?? "").trim();
  const port = Number(form.get("port") ?? 51820);
  const subnet = String(form.get("subnet") ?? "10.8.0.0/24").trim();
  const dns = String(form.get("dns") ?? "1.1.1.1").trim();
  const mtuRaw = String(form.get("mtu") ?? "").trim();
  const mtu = mtuRaw ? Number(mtuRaw) : null;
  if (!name) return { error: "Give the server a name." };
  if (!validEndpoint(endpoint)) return { error: "Endpoint must be a hostname or an IP address, without port." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Port must be between 1 and 65535." };
  if (!parseCidr(subnet)) return { error: "Subnet must be IPv4 CIDR between /16 and /30, for example 10.8.0.0/24." };
  if (!validDns(dns)) return { error: "DNS must be one or more addresses separated by commas." };
  if (mtu !== null && (!Number.isInteger(mtu) || mtu < 1280 || mtu > 1500)) return { error: "MTU must be between 1280 and 1500, or empty." };

  const count = await db.server.count({ where: { userId: user.id } });
  if (count >= FREE_LIMITS.servers && !(await isPro(user))) {
    return { error: `The free plan includes ${FREE_LIMITS.servers} server. Upgrade to Pro for unlimited servers.` };
  }
  const kp = wgKeypair();
  const server = await db.server.create({
    data: { userId: user.id, name, endpoint, port, subnet, dns, mtu, publicKey: kp.publicKey, privateKeyEnc: encrypt(kp.privateKey) },
  });
  redirect(`/dashboard/servers/${server.id}`);
}

/**
 * Import an existing server wg0.conf: the server keeps its keys, the peers keep theirs (their private keys are on the
 * devices, so no client config can be issued for them until "Rotate keys"). Free plan: 1 server, 3 peers.
 */
export async function importServer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "Imported server";
  const endpoint = String(form.get("endpoint") ?? "").trim();
  const dns = String(form.get("dns") ?? "1.1.1.1").trim() || "1.1.1.1";
  const text = String(form.get("conf") ?? "");
  const onlyFirst = form.get("onlyFirst") === "on";
  if (!validEndpoint(endpoint)) return { error: "Public endpoint must be a hostname or an IP address, without port." };
  if (!validDns(dns)) return { error: "DNS must be one or more addresses separated by commas." };
  if (!text.trim()) return { error: "Paste the content of your server wg0.conf." };
  const { conf, error } = parseServerConf(text);
  if (!conf) return { error };
  const pro = await isPro(user);
  const count = await db.server.count({ where: { userId: user.id } });
  if (count >= FREE_LIMITS.servers && !pro) {
    return { error: `The free plan includes ${FREE_LIMITS.servers} server. Upgrade to Pro to import more.` };
  }
  let peers = conf.peers;
  if (peers.length > FREE_LIMITS.peers && !pro) {
    if (!onlyFirst) {
      return { error: `This file has ${peers.length} peers; the free plan includes ${FREE_LIMITS.peers}. Upgrade to Pro (9 EUR/month) to import all of them, or tick "import only the first ${FREE_LIMITS.peers} peers".` };
    }
    peers = peers.slice(0, FREE_LIMITS.peers);
  }
  let publicKey: string;
  try { publicKey = wgPublicKeyOf(conf.privateKey); } catch { return { error: "[Interface] PrivateKey could not be read as an X25519 key." }; }
  const server = await db.server.create({
    data: {
      userId: user.id, name, endpoint, port: conf.port, subnet: conf.subnet, dns, mtu: conf.mtu,
      publicKey, privateKeyEnc: encrypt(conf.privateKey),
      peers: { create: peers.map((p) => ({ name: p.name, ip: p.ip, publicKey: p.publicKey, privateKeyEnc: null, presharedKeyEnc: p.presharedKey ? encrypt(p.presharedKey) : null })) },
    },
  });
  redirect(`/dashboard/servers/${server.id}?imported=${peers.length}`);
}

export async function deleteServer(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(form.get("id") ?? "");
  await db.server.deleteMany({ where: { id, userId: user.id } });
  redirect("/dashboard");
}

export async function addPeer(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const serverId = String(form.get("serverId") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const mode = String(form.get("mode") ?? "full");
  const keepalive = Number(form.get("keepalive") ?? 25);
  if (!name) return { error: "Give the peer a name (laptop, phone, office)." };
  if (!Number.isInteger(keepalive) || keepalive < 0 || keepalive > 600) return { error: "Keepalive must be between 0 and 600 seconds." };
  const server = await db.server.findFirst({ where: { id: serverId, userId: user.id }, include: { peers: true } });
  if (!server) return { error: "Server not found." };
  if (server.peers.length >= FREE_LIMITS.peers && !(await isPro(user))) {
    return { error: `The free plan includes ${FREE_LIMITS.peers} peers per account. Upgrade to Pro for unlimited peers.` };
  }
  const ip = nextFreeIp(server.subnet, server.peers.map((p) => p.ip));
  if (!ip) return { error: "This subnet is full. Create a server with a larger subnet." };
  const kp = wgKeypair();
  const allowedIps = mode === "split" ? server.subnet : "0.0.0.0/0, ::/0";
  await db.peer.create({
    data: { serverId: server.id, name, ip, publicKey: kp.publicKey, privateKeyEnc: encrypt(kp.privateKey), presharedKeyEnc: encrypt(wgPresharedKey()), allowedIps, keepalive },
  });
  revalidatePath(`/dashboard/servers/${server.id}`);
  return undefined;
}

export async function deletePeer(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(form.get("id") ?? "");
  const peer = await db.peer.findFirst({ where: { id, server: { userId: user.id } } });
  if (peer) {
    await db.peer.delete({ where: { id } });
    revalidatePath(`/dashboard/servers/${peer.serverId}`);
  }
}

/** New keys, same IP and name: the old client config stops working immediately on the next server reload. */
export async function rotatePeer(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(form.get("id") ?? "");
  const peer = await db.peer.findFirst({ where: { id, server: { userId: user.id } } });
  if (peer) {
    const kp = wgKeypair();
    await db.peer.update({ where: { id }, data: { publicKey: kp.publicKey, privateKeyEnc: encrypt(kp.privateKey), presharedKeyEnc: encrypt(wgPresharedKey()) } });
    revalidatePath(`/dashboard/servers/${peer.serverId}`);
  }
}
