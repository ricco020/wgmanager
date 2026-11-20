"use client";
/* Server + client pair check: the checks a single file cannot do. Derives each side's public key from its
 * PrivateKey in the browser (WebCrypto X25519, as AddPeer) and compares it with what the other file expects.
 * Covers the usual causes of "Handshake for peer did not complete after 5 seconds". Nothing is uploaded. */
import { useState } from "react";
import { parseCidr } from "@/lib/cidr";
import { publicFromPrivate } from "./AddPeer";

type Sec = { name: string; kv: Record<string, string> };
type Item = { level: "error" | "warn" | "pass"; title: string; text: string; code?: string };

function parse(text: string): Sec[] {
  const out: Sec[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const s = /^\[(\w+)\]$/.exec(line);
    if (s) { out.push({ name: s[1].toLowerCase(), kv: {} }); continue; }
    const m = /^([A-Za-z]+)\s*=\s*(.+)$/.exec(line);
    if (m && out.length) {
      const k = m[1].toLowerCase(), cur = out[out.length - 1].kv;
      cur[k] = cur[k] && (k === "address" || k === "allowedips") ? `${cur[k]}, ${m[2].trim()}` : m[2].trim();
    }
  }
  return out;
}

const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Every host address of the client falls inside one of the server peer's AllowedIPs. */
function covered(addrs: string[], allowed: string[]): string[] {
  const ranges = allowed.map(parseCidr).filter((r): r is Exclude<ReturnType<typeof parseCidr>, { error: string }> => !("error" in r));
  const missing: string[] = [];
  for (const a of addrs) {
    const host = parseCidr(`${a.split("/")[0]}`);
    if ("error" in host) continue;
    if (!ranges.some((r) => r.fam === host.fam && r.lo <= host.lo && host.hi <= r.hi)) missing.push(a.split("/")[0]);
  }
  return missing;
}

async function pub(priv?: string): Promise<string | null> {
  if (!priv) return null;
  try { return await publicFromPrivate(priv); } catch { return null; }
}

export async function checkPair(serverText: string, clientText: string): Promise<Item[]> {
  const S = parse(serverText), C = parse(clientText);
  const sIf = S.find((x) => x.name === "interface"), cIf = C.find((x) => x.name === "interface");
  const sPeers = S.filter((x) => x.name === "peer"), cPeers = C.filter((x) => x.name === "peer");
  const items: Item[] = [];
  if (!sIf?.kv.privatekey || !cIf?.kv.privatekey) {
    items.push({ level: "error", title: "Both PrivateKey lines are needed", text: "The pair check derives each side's public key from its [Interface] PrivateKey. Paste the full server wg0.conf and the full client file." });
    return items;
  }
  const [sPub, cPub] = await Promise.all([pub(sIf.kv.privatekey), pub(cIf.kv.privatekey)]);
  if (!sPub || !cPub) {
    items.push({ level: "error", title: "A PrivateKey is not a valid key", text: `The ${!sPub ? "server" : "client"} PrivateKey does not decode to 32 bytes. Run the single-file checker above on that file first.` });
    return items;
  }
  if (cPeers.length && !sPeers.length) {
    items.push({ level: "warn", title: "The server file has no [Peer]", text: "Did you paste the files the wrong way round? The server file is the one with ListenPort and one [Peer] per device." });
  }

  // 1. The server must list the client's public key.
  const mine = sPeers.find((p) => p.kv.publickey === cPub);
  const cAddrs = list(cIf.kv.address);
  if (!mine) {
    items.push({
      level: "error",
      title: "The server does not know this client",
      text: `No [Peer] in the server file has the client's public key (${cPub}). The server drops the client's handshake without a reply: this is the exact case of "Handshake for peer did not complete after 5 seconds" on the client. Add this block to the server, then run wg syncconf or restart wg-quick.`,
      code: `[Peer]\nPublicKey = ${cPub}\nAllowedIPs = ${cAddrs.length ? cAddrs.map((a) => `${a.split("/")[0]}/${a.includes(":") ? 128 : 32}`).join(", ") : "10.8.0.2/32"}`,
    });
  } else items.push({ level: "pass", title: "The server knows this client", text: `A server [Peer] carries the client's public key ${cPub.slice(0, 10)}...` });

  // 2. The client must point at the server's public key.
  const cPeer = cPeers.find((p) => p.kv.publickey === sPub) ?? cPeers[0];
  if (!cPeers.length) items.push({ level: "error", title: "The client file has no [Peer]", text: "The client needs one [Peer] with the server's public key and Endpoint.", code: `[Peer]\nPublicKey = ${sPub}\nEndpoint = vpn.example.com:${sIf.kv.listenport ?? 51820}\nAllowedIPs = 0.0.0.0/0, ::/0` });
  else if (cPeer.kv.publickey !== sPub) {
    items.push({
      level: "error",
      title: "The client points at the wrong server key",
      text: `The client's [Peer] PublicKey is ${cPeer.kv.publickey ?? "missing"}, but the server's PrivateKey gives ${sPub}. The client encrypts its handshake for a key nobody holds: the server never answers. Usual cause: the server key was regenerated, or the file was copied from another server.`,
      code: `PublicKey = ${sPub}`,
    });
  } else items.push({ level: "pass", title: "The client points at this server", text: `The client's [Peer] PublicKey matches the server's PrivateKey.` });

  // 3. PresharedKey must be identical on both sides, or absent on both.
  if (mine && cPeer) {
    const a = mine.kv.presharedkey, b = cPeer.kv.presharedkey;
    if ((a || b) && a !== b) items.push({ level: "error", title: "PresharedKey differs", text: a && b ? "Both sides have a PresharedKey but not the same one. The handshake fails silently, exactly like a key mismatch." : `Only the ${a ? "server" : "client"} has a PresharedKey. Both sides must have the same one, or neither.`, code: a ? `PresharedKey = ${a}` : undefined });
    else if (a) items.push({ level: "pass", title: "PresharedKey matches", text: "Same PresharedKey on both sides." });
  }

  // 4. The client's tunnel address must be inside the AllowedIPs the server gives it.
  if (mine && cAddrs.length) {
    const miss = covered(cAddrs, list(mine.kv.allowedips));
    if (miss.length) items.push({ level: "error", title: "Handshake works, traffic is dropped", text: `The client sends from ${miss.join(", ")}, which is not in the AllowedIPs of its [Peer] on the server (${mine.kv.allowedips ?? "none"}). WireGuard drops every packet whose source is outside AllowedIPs: wg show displays a recent handshake, but ping and everything else time out.`, code: `AllowedIPs = ${miss.map((a) => `${a}/${a.includes(":") ? 128 : 32}`).join(", ")}` });
    else items.push({ level: "pass", title: "The client address is allowed", text: `${cAddrs.join(", ")} is inside the server's AllowedIPs for this peer.` });
  }

  // 5. Endpoint port = server ListenPort.
  const ep = cPeer?.kv.endpoint;
  const m = ep ? /:(\d+)$/.exec(ep) : null;
  const lp = sIf.kv.listenport;
  if (cPeer && !ep) items.push({ level: "error", title: "The client has no Endpoint", text: "Without Endpoint the client never sends the first handshake packet.", code: `Endpoint = vpn.example.com:${lp ?? 51820}` });
  else if (m && lp && m[1] !== lp) items.push({ level: "error", title: "Endpoint port does not match ListenPort", text: `The client sends to UDP port ${m[1]}, the server listens on ${lp}. Unless a router forwards ${m[1]} to ${lp}, nothing arrives.`, code: `Endpoint = ${ep!.replace(/:\d+$/, `:${lp}`)}` });
  else if (m && lp) items.push({ level: "pass", title: "Endpoint port matches ListenPort", text: `UDP ${lp} on both sides. If the handshake still fails, the port is closed in a firewall or the Endpoint host is wrong (CGNAT, old IP).` });

  // 6. Two clients with the same address on the server.
  if (mine && cAddrs.length) {
    const host = cAddrs[0].split("/")[0];
    const others = sPeers.filter((p) => p !== mine && list(p.kv.allowedips).some((a) => a.split("/")[0] === host));
    if (others.length) items.push({ level: "warn", title: "Another server peer uses the same address", text: `${others.length} other [Peer] also lists ${host}. The one loaded last takes the route: one of the two devices connects but receives nothing.` });
  }
  return items;
}

const LABEL = { error: "Error", warn: "Warning", pass: "Passed" } as const;

export function PairCheck() {
  const [server, setServer] = useState("");
  const [client, setClient] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);

  async function run() {
    const r = await checkPair(server, client);
    setItems(r);
    const bad = r.filter((i) => i.level === "error").length;
    fetch(`/api/check-run?kind=pair&peers=${bad}`, { method: "POST", keepalive: true }).catch(() => {});
  }

  return (
    <div className="panel" id="pair">
      <h2 style={{ marginTop: 0 }}>Handshake did not complete? Check the server and the client together</h2>
      <p className="muted" style={{ fontSize: 14 }}>
        One file can be valid and the pair still broken. Paste both: the page derives each side&apos;s public key from its PrivateKey
        and checks that the server lists the client, that the client points at this server, the PresharedKey, the client address
        against AllowedIPs and the port. It runs in this page, nothing is uploaded.
      </p>
      <div className="pair-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        <label style={{ display: "block" }}>
          <span className="ws-title">Server wg0.conf</span>
          <textarea value={server} onChange={(e) => setServer(e.target.value)} spellCheck={false} autoComplete="off" style={{ width: "100%", minHeight: 160, boxSizing: "border-box" }} placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.8.0.1/24\nListenPort = 51820\n\n[Peer]\nPublicKey = ...\nAllowedIPs = 10.8.0.2/32"} />
        </label>
        <label style={{ display: "block" }}>
          <span className="ws-title">Client .conf</span>
          <textarea value={client} onChange={(e) => setClient(e.target.value)} spellCheck={false} autoComplete="off" style={{ width: "100%", minHeight: 160, boxSizing: "border-box" }} placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.8.0.2/32\n\n[Peer]\nPublicKey = ...\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0"} />
        </label>
      </div>
      <p><button className="btn" type="button" onClick={run} disabled={!server.trim() || !client.trim()}>Check the pair</button></p>
      {items && (
        <ul className="findings" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className={`f-${it.level}`}>
              <b>{LABEL[it.level]}</b><span className="muted"> {it.title}</span>
              <div style={{ overflowWrap: "anywhere" }}>{it.text}</div>
              {it.code && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><code>{it.code}</code></pre>}
            </li>
          ))}
        </ul>
      )}
      {items && items.every((i) => i.level !== "error") && (
        <p className="muted" style={{ fontSize: 14 }}>
          Keys, port and addresses agree. If the handshake still fails, the UDP port is closed (server firewall or cloud security
          group) or the server sits behind CGNAT: a small VPS with a public IPv4 removes that last cause, for example{" "}
          <a href="/out/vps?from=pair&p=hg" rel="sponsored nofollow">Hostinger KVM 1</a> (affiliate link: we may earn a commission).
        </p>
      )}
    </div>
  );
}
