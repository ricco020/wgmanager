"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { FREE_LIMITS, PRO_PRICE_EUR } from "@/lib/site";

/* Adds one peer to a pasted server wg0.conf, entirely in the browser: X25519 keys come from WebCrypto,
 * nothing is uploaded. Gives the [Peer] block to append on the server, the client .conf and its QR code. */

type Server = { address: number; prefix: number; port: number; privateKey: string | null; used: Set<number> };

function ip4(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}
const fmt = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

function parseServer(text: string): Server | null {
  let section = "";
  let address: number | null = null, prefix = 24, port = 51820, privateKey: string | null = null;
  const used = new Set<number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = /^\[(\w+)\]$/.exec(line);
    if (sec) { section = sec[1].toLowerCase(); continue; }
    const kv = /^([A-Za-z]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const k = kv[1].toLowerCase(), v = kv[2].trim();
    if (section === "interface") {
      if (k === "privatekey") privateKey = v;
      if (k === "listenport" && /^\d+$/.test(v)) port = Number(v);
      if (k === "address") for (const a of v.split(",")) {
        const [h, p] = a.trim().split("/");
        const n = ip4(h);
        if (n !== null && address === null) { address = n; prefix = p ? Number(p) : 32; used.add(n); }
      }
    } else if (section === "peer" && k === "allowedips") {
      for (const a of v.split(",")) {
        const n = ip4(a.trim().split("/")[0]);
        if (n !== null) used.add(n);
      }
    }
  }
  if (address === null || prefix < 16 || prefix > 30) return null;
  return { address, prefix, port, privateKey, used };
}

function nextFree(s: Server): number | null {
  const mask = (~0 << (32 - s.prefix)) >>> 0;
  const net = (s.address & mask) >>> 0, size = 2 ** (32 - s.prefix);
  for (let i = 1; i < size - 1; i++) if (!s.used.has(net + i)) return net + i;
  return null;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
// PKCS#8 header of a raw X25519 private key (RFC 8410): 16 fixed bytes, then the 32 key bytes.
const PKCS8_X25519 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);

async function publicFromPrivate(priv: string): Promise<string> {
  const raw = Uint8Array.from(atob(priv), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("bad key");
  const der = new Uint8Array(48);
  der.set(PKCS8_X25519); der.set(raw, 16);
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "X25519" }, true, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return b64(unb64url(jwk.x as string));
}

async function newKeyPair(): Promise<{ priv: string; pub: string }> {
  const kp = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { priv: b64(unb64url(jwk.d as string)), pub: b64(unb64url(jwk.x as string)) };
}

type Out = { block: string; client: string; qr: string; ip: string; name: string };

export function AddPeer({ text, peers, signedIn, onImport }: { text: string; peers: number; signedIn: boolean; onImport: (extra: string) => void }) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [full, setFull] = useState(true);
  const [out, setOut] = useState<Out | null>(null);
  const [err, setErr] = useState("");

  async function add() {
    setErr(""); setOut(null);
    const s = parseServer(text);
    if (!s) return setErr("No IPv4 Address with a /16 to /30 prefix found under [Interface], so there is no subnet to pick a free IP from.");
    if (!s.privateKey) return setErr("The [Interface] has no PrivateKey, so the server's public key cannot be derived. Paste the full server wg0.conf.");
    const host = endpoint.trim();
    if (!host) return setErr("Enter the server's public hostname or IP: the client needs it as Endpoint.");
    const ip = nextFree(s);
    if (ip === null) return setErr("The subnet is full: every address is already taken by the server or a peer.");
    let serverPub: string, kp: { priv: string; pub: string };
    try {
      serverPub = await publicFromPrivate(s.privateKey);
      kp = await newKeyPair();
    } catch {
      return setErr("This browser cannot generate X25519 keys (WebCrypto). Use a current Chrome, Firefox or Safari, or create the peer in WireGuard Manager.");
    }
    const psk = b64(crypto.getRandomValues(new Uint8Array(32)));
    const label = name.trim().replace(/[\r\n#]/g, "") || `peer-${fmt(ip).split(".").pop()}`;
    const ep = /:\d+$/.test(host) || host.startsWith("[") ? host : `${host}:${s.port}`;
    const net = fmt((s.address & ((~0 << (32 - s.prefix)) >>> 0)) >>> 0);
    const block = `\n[Peer]\n# ${label}\nPublicKey = ${kp.pub}\nPresharedKey = ${psk}\nAllowedIPs = ${fmt(ip)}/32\n`;
    const client = `[Interface]\nPrivateKey = ${kp.priv}\nAddress = ${fmt(ip)}/32\n${full ? "DNS = 1.1.1.1\n" : ""}\n[Peer]\nPublicKey = ${serverPub}\nPresharedKey = ${psk}\nEndpoint = ${ep}\nAllowedIPs = ${full ? "0.0.0.0/0, ::/0" : `${net}/${s.prefix}`}\nPersistentKeepalive = 25\n`;
    const qr = await QRCode.toDataURL(client, { margin: 1, width: 240 });
    setOut({ block, client, qr, ip: fmt(ip), name: label });
    fetch(`/api/check-run?kind=addpeer&peers=${peers}`, { method: "POST", keepalive: true }).catch(() => {});
  }

  function download() {
    if (!out) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out.client], { type: "text/plain" }));
    a.download = `${out.name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 15) || "peer"}.conf`;
    a.click();
  }

  return (
    <div className="handoff">
      <h3>Add a peer to this server</h3>
      <p className="muted">Picks the next free IP in the subnet, generates the keys and a preshared key in this page, and gives you the block for the server and the file for the device. Nothing is uploaded.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 160px" }}>Peer name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="phone" /></label>
        <label style={{ flex: "2 1 220px" }}>Server public hostname or IP<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="vpn.example.com" /></label>
        <label style={{ flex: "1 1 160px" }}>Traffic
          <select value={full ? "full" : "split"} onChange={(e) => setFull(e.target.value === "full")}>
            <option value="full">All traffic (full tunnel)</option>
            <option value="split">Tunnel subnet only</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={add}>Add peer</button>
      </div>
      {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      {out && (
        <div className="fade" style={{ marginTop: 16 }}>
          <p><b>1. On the server</b>, append this to <code>/etc/wireguard/wg0.conf</code>, then apply it without dropping the other peers: <code>wg syncconf wg0 &lt;(wg-quick strip wg0)</code></p>
          <pre>{out.block.trim()}</pre>
          <p><b>2. On the device</b> ({out.ip}): import this file, or scan the code from the WireGuard app.</p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <pre style={{ flex: "1 1 320px", margin: 0 }}>{out.client}</pre>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={out.qr} width={240} height={240} alt={`QR code of the ${out.name} client configuration`} style={{ background: "#fff", borderRadius: 6 }} />
          </div>
          <p style={{ marginTop: 12 }}><button className="btn ghost sm" type="button" onClick={download}>Download {out.name}.conf</button></p>
          <p className="muted" style={{ marginTop: 12 }}>
            This page forgets the keys when you close it. Next time you add a peer you will paste the file again and track which IPs are taken.
            WireGuard Manager keeps the server and its peers, re-issues a lost device in one click and writes the full wg0.conf for you.
            {peers + 1 > FREE_LIMITS.peers
              ? ` With ${peers + 1} peers this server needs Pro (${PRO_PRICE_EUR} EUR/month).`
              : ` Free up to ${FREE_LIMITS.peers} peers.`}
            {" "}<button className="btn sm" type="button" onClick={() => onImport(out.block)}>{signedIn ? "Import this server" : "Keep this server in WireGuard Manager"}</button>
          </p>
        </div>
      )}
    </div>
  );
}
