/* WireGuard config checker. Pure functions, no I/O: runs in the browser so keys never leave the page.
 * Rules follow what wg(8) and wg-quick(8) actually do with a file (case-insensitive keys, comma lists,
 * repeatable Address/DNS/AllowedIPs lines), not a stricter house style. */

/** sessionStorage key carrying a checked file from /check to the dashboard import form. */
export const HANDOFF_KEY = "wg_check_conf";
/** sessionStorage key carrying the server's public endpoint, when the page that sent the file knew it. */
export const EP_KEY = "wg_check_ep";

export type Level = "error" | "warn" | "info";
export type Finding = { level: Level; where: string; line?: number; msg: string };
export type CheckResult = {
  kind: "server" | "client" | "unknown";
  peers: number;
  findings: Finding[];
};

const IFACE_KEYS = new Set(["privatekey", "listenport", "fwmark", "address", "dns", "mtu", "table", "preup", "postup", "predown", "postdown", "saveconfig"]);
const PEER_KEYS = new Set(["publickey", "presharedkey", "allowedips", "endpoint", "persistentkeepalive"]);
const SINGLE = new Set(["privatekey", "listenport", "mtu", "fwmark", "table", "saveconfig", "publickey", "presharedkey", "endpoint", "persistentkeepalive"]);
const CANON: Record<string, string> = {
  privatekey: "PrivateKey", listenport: "ListenPort", fwmark: "FwMark", address: "Address", dns: "DNS", mtu: "MTU",
  table: "Table", preup: "PreUp", postup: "PostUp", predown: "PreDown", postdown: "PostDown", saveconfig: "SaveConfig",
  publickey: "PublicKey", presharedkey: "PresharedKey", allowedips: "AllowedIPs", endpoint: "Endpoint", persistentkeepalive: "PersistentKeepalive",
};

/** A WireGuard key is 32 bytes in base64: 43 characters then "=". The 43rd character only carries 4 data bits,
 *  so it must be one of 16 letters; anything else means the key was truncated or edited. */
export function keyProblem(k: string): string | null {
  if (!k) return "is empty";
  if (/\s/.test(k)) return "contains a space";
  if (k.length !== 44) return `is ${k.length} characters long, a WireGuard key has 44 (truncated or extra characters)`;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(k)) return "is not base64 (only A-Z, a-z, 0-9, + and /, ending with =)";
  if (!/[AEIMQUYcgkosw048]/.test(k[42])) return "does not decode to exactly 32 bytes (one character was changed)";
  return null;
}

type V4 = { base: number; prefix: number; hostBits: boolean };
function v4(cidr: string, defaultPrefix: number | null): V4 | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(cidr);
  if (!m) return null;
  const o = m.slice(1, 5).map(Number);
  if (o.some((x) => x > 255)) return null;
  if (m[5] === undefined && defaultPrefix === null) return null;
  const prefix = m[5] === undefined ? (defaultPrefix as number) : Number(m[5]);
  if (prefix > 32) return null;
  const ip = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { base: (ip & mask) >>> 0, prefix, hostBits: ((ip & ~mask) >>> 0) !== 0 };
}
function ipInt(s: string): number | null {
  const c = v4(s.split("/")[0], 32);
  return c ? c.base : null;
}
function v6ok(cidr: string): boolean {
  const [a, p] = cidr.split("/");
  if (p !== undefined && !(/^\d{1,3}$/.test(p) && Number(p) <= 128)) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(a) || !a.includes(":")) return false;
  const dbl = a.split("::").length - 1;
  if (dbl > 1) return false;
  const groups = a.split(":").filter((g) => g !== "");
  return groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g) || /^\d+\.\d+\.\d+\.\d+$/.test(g)) && (dbl === 1 ? groups.length < 8 : groups.length === 8);
}
function overlap(a: V4, b: V4): boolean {
  const p = Math.min(a.prefix, b.prefix);
  const mask = p === 0 ? 0 : (~0 << (32 - p)) >>> 0;
  return ((a.base & mask) >>> 0) === ((b.base & mask) >>> 0);
}
function fmt(c: V4): string {
  return `${[c.base >>> 24, (c.base >>> 16) & 255, (c.base >>> 8) & 255, c.base & 255].join(".")}/${c.prefix}`;
}
function isPrivate(ip: number): boolean {
  const a = ip >>> 24, b = (ip >>> 16) & 255;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127 || (a === 100 && b >= 64 && b <= 127);
}
function list(v: string): string[] {
  return v.split(",").map((x) => x.trim()).filter(Boolean);
}

type Entry = { key: string; value: string; line: number };
type Section = { name: "interface" | "peer"; line: number; label: string; entries: Entry[] };

export function checkConfig(text: string): CheckResult {
  const F: Finding[] = [];
  const add = (level: Level, where: string, msg: string, line?: number) => F.push({ level, where, msg, line });
  if (text.length > 200_000) return { kind: "unknown", peers: 0, findings: [{ level: "error", where: "File", msg: "File too large (200 KB max)." }] };

  const sections: Section[] = [];
  let pending = "";
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith("#") || line.startsWith(";")) {
      const c = line.replace(/^[#;]+\s*/, "").slice(0, 40);
      const cur = sections[sections.length - 1];
      // A comment right under a [Peer] header names that peer; one after its keys names the next peer.
      if (cur && cur.name === "peer" && !cur.entries.length && !cur.label) cur.label = c;
      else pending = c;
      return;
    }
    const sec = /^\[\s*([^\]]*?)\s*\]$/.exec(line);
    if (sec) {
      const name = sec[1].toLowerCase();
      if (name === "interface" || name === "peer") sections.push({ name, line: n, label: pending, entries: [] });
      else add("error", "File", `Unknown section [${sec[1]}]. Only [Interface] and [Peer] exist; wg-quick refuses the file.`, n);
      pending = "";
      return;
    }
    const eq = line.indexOf("=");
    if (eq < 0) { add("error", "File", `"${line.slice(0, 40)}" is not a "Key = value" line; wg-quick stops here.`, n); return; }
    const key = line.slice(0, eq).trim().toLowerCase();
    let value = line.slice(eq + 1).trim();
    const hash = value.indexOf("#");
    if (hash >= 0) value = value.slice(0, hash).trim();
    const cur = sections[sections.length - 1];
    const peerNo = sections.filter((x) => x.name === "peer").length;
    const where = cur?.name === "peer" ? `[Peer] ${peerNo}${cur.label ? ` (${cur.label})` : ""}` : "[Interface]";
    if (!cur) { add("error", "File", `${line.slice(0, eq).trim()} appears before any [Interface] or [Peer] header.`, n); return; }
    const allowed = cur.name === "interface" ? IFACE_KEYS : PEER_KEYS;
    if (!allowed.has(key)) {
      const other = cur.name === "interface" ? PEER_KEYS : IFACE_KEYS;
      add("error", where,
        other.has(key) ? `${CANON[key]} belongs in ${cur.name === "interface" ? "a [Peer]" : "[Interface]"} section, not here.` : `Unknown key "${line.slice(0, eq).trim()}" (typo?). wg-quick reports "Line unrecognized" and refuses the file.`, n);
      return;
    }
    if (SINGLE.has(key) && cur.entries.some((e) => e.key === key)) add("warn", where, `${CANON[key]} is set twice in the same section; only the last value is used.`, n);
    cur.entries.push({ key, value, line: n });
  });

  const ifaces = sections.filter((s) => s.name === "interface");
  const peers = sections.filter((s) => s.name === "peer");
  if (ifaces.length === 0) add("error", "File", "No [Interface] section. Every WireGuard config starts with one.");
  if (ifaces.length > 1) add("error", "File", `${ifaces.length} [Interface] sections. One file describes one interface: split it into two files.`, ifaces[1].line);
  if (peers.length === 0 && ifaces.length) add("warn", "File", "No [Peer] section: the interface comes up but cannot talk to anyone.");

  const get = (s: Section, k: string) => s.entries.filter((e) => e.key === k);
  const one = (s: Section, k: string) => { const e = get(s, k); return e.length ? e[e.length - 1] : undefined; };

  const anyEndpoint = peers.some((p) => one(p, "endpoint"));
  const iface = ifaces[0];
  const hasListen = !!(iface && one(iface, "listenport"));
  const kind: CheckResult["kind"] = !iface ? "unknown" : peers.length > 1 && !anyEndpoint ? "server" : peers.length >= 1 && anyEndpoint && peers.length === 1 ? "client" : hasListen && !anyEndpoint ? "server" : anyEndpoint ? "client" : "unknown";

  let ifaceNets: V4[] = [];
  let ifaceIps: number[] = [];
  let privKey = "";
  if (iface) {
    const W = "[Interface]";
    const pk = one(iface, "privatekey");
    if (!pk) add("error", W, "PrivateKey is missing. Without it the interface has no identity.", iface.line);
    else { privKey = pk.value; const p = keyProblem(pk.value); if (p) add("error", W, `PrivateKey ${p}.`, pk.line); }

    const addrs = get(iface, "address");
    if (!addrs.length) add(kind === "client" ? "error" : "warn", W, "Address is missing: the tunnel interface gets no IP, so nothing can be routed through it.", iface.line);
    for (const a of addrs) for (const c of list(a.value)) {
      const x = v4(c, 32);
      if (x) { ifaceNets.push(x); ifaceIps.push(ipInt(c) as number); }
      else if (!v6ok(c)) add("error", W, `Address "${c}" is not a valid IPv4 or IPv6 address with prefix.`, a.line);
    }
    if (kind === "server" && ifaceNets.some((n) => n.prefix === 32) && peers.length > 1)
      add("warn", W, "Server Address uses /32: the kernel will not route the other tunnel addresses to wg0. Use the subnet prefix, for example 10.8.0.1/24.", addrs[0]?.line);

    const lp = one(iface, "listenport");
    if (lp) { const v = Number(lp.value); if (!Number.isInteger(v) || v < 1 || v > 65535) add("error", W, `ListenPort "${lp.value}" must be a number between 1 and 65535.`, lp.line); }
    else if (kind === "server") add("warn", W, "ListenPort is missing: the server picks a random UDP port at each start, so clients cannot reach it reliably. Set ListenPort = 51820.", iface.line);

    const mtu = one(iface, "mtu");
    if (mtu) {
      const v = Number(mtu.value);
      if (!Number.isInteger(v)) add("error", W, `MTU "${mtu.value}" is not a number.`, mtu.line);
      else if (v < 1280) add("error", W, `MTU ${v} is below 1280, the IPv6 minimum: IPv6 through the tunnel breaks. 1280 is the safe floor.`, mtu.line);
      else if (v > 1420) add("warn", W, `MTU ${v} is above 1420. WireGuard adds 60 to 80 bytes of headers, so on a 1500 link anything above 1420 fragments: pages that load halfway and stalled SSH are the usual symptom.`, mtu.line);
    }

    const dns = get(iface, "dns");
    if (dns.length && kind === "server") add("warn", W, "DNS on a server: wg-quick rewrites the server's own resolver when the tunnel comes up. DNS belongs in client files.", dns[0].line);
    for (const d of dns) for (const c of list(d.value)) if (!v4(c, 32) && !v6ok(c) && !/^[a-zA-Z0-9.-]+$/.test(c)) add("error", W, `DNS entry "${c}" is neither an IP nor a search domain.`, d.line);

    const sc = one(iface, "saveconfig");
    if (sc && /^true$/i.test(sc.value)) add("warn", W, "SaveConfig = true: wg-quick overwrites this file when the interface goes down. Edits made by hand while it runs are lost.", sc.line);

    const post = get(iface, "postup");
    const masq = post.find((e) => /MASQUERADE/i.test(e.value));
    if (masq) {
      const m = /-o\s+(\S+)/.exec(masq.value);
      if (m) add("info", W, `NAT goes out through "${m[1].replace(/;$/, "")}". If clients connect but have no internet, compare it with the interface shown by "ip route show default" on the server.`, masq.line);
    } else if (kind === "server" && peers.some((p) => get(p, "allowedips").some(() => true))) {
      add("info", W, "No MASQUERADE rule in PostUp. Fine for a site-to-site or LAN-only tunnel; full-tunnel clients will have no internet access without NAT and net.ipv4.ip_forward=1.");
    }
  }

  const seenKeys = new Map<string, number>();
  const routes: Array<{ net: V4; peer: number; line: number }> = [];
  peers.forEach((p, i) => {
    const W = `[Peer] ${i + 1}${p.label ? ` (${p.label})` : ""}`;
    const pub = one(p, "publickey");
    if (!pub) add("error", W, "PublicKey is missing: wg-quick refuses a peer without one.", p.line);
    else {
      const pr = keyProblem(pub.value);
      if (pr) add("error", W, `PublicKey ${pr}.`, pub.line);
      if (privKey && pub.value === privKey) add("error", W, "PublicKey is the same string as your [Interface] PrivateKey. You pasted the private key where the other side's public key goes.", pub.line);
      if (seenKeys.has(pub.value)) add("error", W, `Same PublicKey as peer ${seenKeys.get(pub.value)}. wg keeps only one of them: one device will never connect.`, pub.line);
      else seenKeys.set(pub.value, i + 1);
    }
    const psk = one(p, "presharedkey");
    if (psk) { const pr = keyProblem(psk.value); if (pr) add("error", W, `PresharedKey ${pr}.`, psk.line); }

    const aips = get(p, "allowedips");
    if (!aips.length) add("warn", W, "AllowedIPs is missing: no traffic is accepted from or sent to this peer.", p.line);
    const all = aips.flatMap((a) => list(a.value).map((c) => ({ c, line: a.line })));
    let v4full = false, v6full = false;
    for (const { c, line } of all) {
      if (c === "::/0") v6full = true;
      const x = v4(c, 32);
      if (x) {
        if (x.prefix === 0) v4full = true;
        if (x.hostBits) add("warn", W, `AllowedIPs ${c} has host bits set; wg turns it into ${fmt(x)}. ${kind === "server" ? `On a server that sends the whole ${fmt(x)} range to this one peer. A single client should be ${c.split("/")[0]}/32.` : "Write the network address to avoid surprises."}`, line);
        routes.push({ net: x, peer: i + 1, line });
        if (kind === "server" && x.prefix === 32 && ifaceIps.includes(x.base)) add("error", W, `AllowedIPs ${c} is the server's own tunnel address.`, line);
        if (kind === "server" && x.prefix === 32 && ifaceNets.length && !ifaceNets.some((n) => overlap(n, x))) add("warn", W, `${c} is outside the server subnet (${ifaceNets.map(fmt).join(", ")}). It works only if the client uses that address and you route it yourself.`, line);
      } else if (!v6ok(c)) add("error", W, `AllowedIPs entry "${c}" is not a valid address with prefix.`, line);
    }
    if (kind === "server" && v4full && peers.length > 1) add("error", W, "AllowedIPs 0.0.0.0/0 on a server peer routes ALL traffic to this one peer and starves the others. Give each client its own /32.", aips[0]?.line);

    const ep = one(p, "endpoint");
    if (ep) {
      const m = /^(\[[0-9a-fA-F:.]+\]|[^:\s]+):(\d{1,5})$/.exec(ep.value);
      if (!m) add("error", W, `Endpoint "${ep.value}" must be host:port, for example vpn.example.com:51820 (IPv6 in brackets: [2001:db8::1]:51820).`, ep.line);
      else {
        const port = Number(m[2]);
        if (port < 1 || port > 65535) add("error", W, `Endpoint port ${port} is out of range.`, ep.line);
        const ipn = ipInt(m[1]);
        if (ipn !== null && isPrivate(ipn)) add("warn", W, `Endpoint ${m[1]} is a private address: this config only works from inside that network, not from mobile data or another Wi-Fi.`, ep.line);
      }
    } else if (kind === "client") add("error", W, "Endpoint is missing: a client without Endpoint can never start the handshake.", p.line);

    const ka = one(p, "persistentkeepalive");
    if (ka) {
      const v = /^off$/i.test(ka.value) ? 0 : Number(ka.value);
      if (!Number.isInteger(v) || v < 0 || v > 65535) add("error", W, `PersistentKeepalive "${ka.value}" must be 0 to 65535 seconds or "off".`, ka.line);
      else if (v > 0 && v < 10) add("warn", W, `PersistentKeepalive ${v} s is very short: battery and data cost on phones for no gain. 25 is the usual value.`, ka.line);
    } else if (kind === "client") add("info", W, "No PersistentKeepalive. Behind NAT (home router, mobile data) the tunnel goes silent after idle and the server cannot reach you. Add PersistentKeepalive = 25 if that matters.", p.line);

    if (kind === "client" && v4full && !v6full) add("warn", W, "Full tunnel for IPv4 (0.0.0.0/0) but not IPv6: on a network with IPv6, part of your traffic leaves outside the tunnel. Add ::/0 to AllowedIPs.", aips[0]?.line);
    if (kind === "client" && (v4full || v6full) && iface && !get(iface, "dns").length) add("warn", "[Interface]", "Full tunnel without DNS: name lookups still go to the local network's resolver (a DNS leak). Add DNS = 1.1.1.1 or your own resolver.", iface.line);
  });

  if (kind === "server") {
    for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
      const r1 = routes[a], r2 = routes[b];
      if (r1.peer !== r2.peer && overlap(r1.net, r2.net)) {
        add("error", `[Peer] ${r2.peer}`, `AllowedIPs ${fmt(r2.net)} overlaps ${fmt(r1.net)} of peer ${r1.peer}. wg gives the range to the last peer loaded, so peer ${r1.peer} silently stops receiving traffic. This is the classic "handshake OK, no traffic" bug.`, r2.line);
      }
    }
  }

  const order: Record<Level, number> = { error: 0, warn: 1, info: 2 };
  F.sort((x, y) => order[x.level] - order[y.level] || (x.line ?? 0) - (y.line ?? 0));
  return { kind, peers: peers.length, findings: F };
}
