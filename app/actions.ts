"use server";

import { cookies } from "next/headers";
import { fullTunnelExceptLan } from "@/lib/cidr";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, COOKIE_OPTIONS, currentUser, hashPassword, passwordAcceptable, signSession, verifyPassword } from "@/lib/auth";
import { encrypt, wgKeypair, wgPresharedKey, wgPublicKeyOf } from "@/lib/crypto";
import { db } from "@/lib/db";
import { FREE_LIMITS } from "@/lib/site";
import { cleanRef, peerBucket, recordHit } from "@/lib/stats";
import { isPro } from "@/lib/stripe";
import { nextFreeIp, parseCidr, parseServerConf, validDns, validEndpoint } from "@/lib/wg";

/** React 19 resets a form after its action completes, so an error carries the typed values back for defaultValue. */
export type ActionState = { error?: string; values?: Record<string, string>; paywall?: number } | undefined;

function fail(form: FormData, error: string, fields: string[]): ActionState {
  const values: Record<string, string> = {};
  for (const f of fields) values[f] = String(form.get(f) ?? "");
  return { error, values };
}
const SERVER_FIELDS = ["name", "endpoint", "port", "subnet", "dns", "mtu"];
const IMPORT_FIELDS = ["name", "endpoint", "dns", "conf"];
const PEER_FIELDS = ["name", "mode", "keepalive"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, signSession(userId), COOKIE_OPTIONS);
}

export async function signup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  if (!EMAIL_RE.test(email)) return fail(form, "Please enter a valid email address.", ["email"]);
  if (!passwordAcceptable(password)) return fail(form, "Password must be at least 10 characters.", ["email"]);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return fail(form, "An account already exists for this email. Log in instead.", ["email"]);
  const ref = cleanRef((await cookies()).get("wg_ref")?.value);
  const user = await db.user.create({ data: { email, hash: hashPassword(password), ref: ref || null } });
  await setSession(user.id);
  redirect(next === "pro" ? "/pricing" : next === "import" ? "/dashboard#import" : "/dashboard");
}

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  // Always run the hash check so an unknown email takes as long as a wrong password.
  const ok = verifyPassword(password, user?.hash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAA");
  if (!user || !ok) return fail(form, "Email or password is incorrect.", ["email"]);
  await setSession(user.id);
  const next = String(form.get("next") ?? "");
  redirect(next === "pro" ? "/pricing" : next === "import" ? "/dashboard#import" : "/dashboard");
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
  if (!name) return fail(form, "Give the server a name.", SERVER_FIELDS);
  if (!validEndpoint(endpoint)) return fail(form, "Endpoint must be a hostname or an IP address, without port.", SERVER_FIELDS);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail(form, "Port must be between 1 and 65535.", SERVER_FIELDS);
  if (!parseCidr(subnet)) return fail(form, "Subnet must be IPv4 CIDR between /16 and /30, for example 10.8.0.0/24.", SERVER_FIELDS);
  if (!validDns(dns)) return fail(form, "DNS must be one or more addresses separated by commas.", SERVER_FIELDS);
  if (mtu !== null && (!Number.isInteger(mtu) || mtu < 1280 || mtu > 1500)) return fail(form, "MTU must be between 1280 and 1500, or empty.", SERVER_FIELDS);

  const count = await db.server.count({ where: { userId: user.id } });
  if (count >= FREE_LIMITS.servers && !(await isPro(user))) {
    return fail(form, `The free plan includes ${FREE_LIMITS.servers} server. Upgrade to Pro for unlimited servers.`, SERVER_FIELDS);
  }
  const kp = wgKeypair();
  const server = await db.server.create({
    data: { userId: user.id, name, endpoint, port, subnet, dns, mtu, publicKey: kp.publicKey, privateKeyEnc: encrypt(kp.privateKey) },
  });
  await recordHit("/dashboard:create-ok");
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
  if (!validEndpoint(endpoint)) return fail(form, "Public endpoint must be a hostname or an IP address, without port.", IMPORT_FIELDS);
  if (!validDns(dns)) return fail(form, "DNS must be one or more addresses separated by commas.", IMPORT_FIELDS);
  if (!text.trim()) return fail(form, "Paste the content of your server wg0.conf.", IMPORT_FIELDS);
  const { conf, error } = parseServerConf(text);
  if (!conf) {
    await recordHit("/dashboard:import-error");
    return fail(form, error ?? "Could not read this file.", IMPORT_FIELDS);
  }
  const pro = await isPro(user);
  const count = await db.server.count({ where: { userId: user.id } });
  if (count >= FREE_LIMITS.servers && !pro) {
    return fail(form, `The free plan includes ${FREE_LIMITS.servers} server. Upgrade to Pro to import more.`, IMPORT_FIELDS);
  }
  let peers = conf.peers;
  if (peers.length > FREE_LIMITS.peers && !pro) {
    if (!onlyFirst) {
      // The moment the free plan is too small for a real server: counted, and answered with a checkout button.
      await recordHit(`/dashboard:paywall-import-${peerBucket(peers.length)}`);
      return { ...fail(form, `This file has ${peers.length} peers; the free plan includes ${FREE_LIMITS.peers}. Upgrade to Pro (9 EUR/month) to import all of them, or tick "import only the first ${FREE_LIMITS.peers} peers".`, IMPORT_FIELDS), paywall: peers.length };
    }
    peers = peers.slice(0, FREE_LIMITS.peers);
  }
  let publicKey: string;
  try { publicKey = wgPublicKeyOf(conf.privateKey); } catch { return fail(form, "[Interface] PrivateKey could not be read as an X25519 key.", IMPORT_FIELDS); }
  const server = await db.server.create({
    data: {
      userId: user.id, name, endpoint, port: conf.port, subnet: conf.subnet, dns, mtu: conf.mtu,
      publicKey, privateKeyEnc: encrypt(conf.privateKey),
      peers: { create: peers.map((p) => ({ name: p.name, ip: p.ip, publicKey: p.publicKey, privateKeyEnc: null, presharedKeyEnc: p.presharedKey ? encrypt(p.presharedKey) : null })) },
    },
  });
  await recordHit(`/dashboard:import-ok-${peerBucket(peers.length)}`);
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
  if (!name) return fail(form, "Give the peer a name (laptop, phone, office).", PEER_FIELDS);
  if (!Number.isInteger(keepalive) || keepalive < 0 || keepalive > 600) return fail(form, "Keepalive must be between 0 and 600 seconds.", PEER_FIELDS);
  const server = await db.server.findFirst({ where: { id: serverId, userId: user.id }, include: { peers: true } });
  if (!server) return fail(form, "Server not found.", PEER_FIELDS);
  if (server.peers.length >= FREE_LIMITS.peers && !(await isPro(user))) {
    return fail(form, `The free plan includes ${FREE_LIMITS.peers} peers per account. Upgrade to Pro for unlimited peers.`, PEER_FIELDS);
  }
  const ip = nextFreeIp(server.subnet, server.peers.map((p) => p.ip));
  if (!ip) return fail(form, "This subnet is full. Create a server with a larger subnet.", PEER_FIELDS);
  const kp = wgKeypair();
  const allowedIps = mode === "split" ? server.subnet : mode === "nolan" ? fullTunnelExceptLan(server.subnet) : "0.0.0.0/0, ::/0";
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
