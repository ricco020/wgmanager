import { encrypt, wgKeypair, wgPresharedKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { SAMPLE_NAME } from "@/lib/site";
import { nextFreeIp } from "@/lib/wg";

/**
 * Sample server with two devices for an account that has none yet: real keys, placeholder endpoint
 * (vpn.example.com), deleted like any server. Kept out of app/actions.ts ("use server") so it is never
 * callable from the browser with someone else's user id.
 */
export async function makeSample(userId: string): Promise<string> {
  const subnet = "10.8.0.0/24";
  const kp = wgKeypair();
  const server = await db.server.create({
    data: { userId, name: SAMPLE_NAME, endpoint: "vpn.example.com", port: 51820, subnet, dns: "1.1.1.1", mtu: null, publicKey: kp.publicKey, privateKeyEnc: encrypt(kp.privateKey) },
  });
  const ips: string[] = [];
  for (const name of ["laptop", "phone"]) {
    const ip = nextFreeIp(subnet, ips);
    if (!ip) break;
    ips.push(ip);
    const pk = wgKeypair();
    await db.peer.create({
      data: { serverId: server.id, name, ip, publicKey: pk.publicKey, privateKeyEnc: encrypt(pk.privateKey), presharedKeyEnc: encrypt(wgPresharedKey()), allowedIps: "0.0.0.0/0, ::/0", keepalive: 25 },
    });
  }
  return server.id;
}
