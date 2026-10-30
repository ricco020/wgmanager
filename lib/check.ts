/* WireGuard config checker. Pure functions, no I/O: runs in the browser so keys never leave the page.
 * Rules follow what wg(8) and wg-quick(8) actually do with a file (case-insensitive keys, comma lists,
 * repeatable Address/DNS/AllowedIPs lines), not a stricter house style. */

/** sessionStorage key carrying a checked file from /check to the dashboard import form. */
export const HANDOFF_KEY = "wg_check_conf";
/** sessionStorage key carrying the server's public endpoint, when the page that sent the file knew it. */
export const EP_KEY = "wg_check_ep";

export type Level = "error" | "warn" | "info";
/** problem: what is wrong in the file. consequence: what wg/wg-quick or the network does with it. fix: what to change,
 *  with code: the exact line(s) to paste when a single replacement exists. msg joins problem and consequence (QR tool). */
export type Finding = { level: Level; where: string; line?: number; problem: string; consequence: string; fix: string; code?: string; msg: string };
export type CheckResult = {
  kind: "server" | "client" | "unknown" | "wg-easy";
  peers: number;
  findings: Finding[];
  /** An Endpoint points at a LAN or CGNAT address: the tunnel cannot be reached from outside that network. */
  privateEndpoint?: boolean;
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
type Parts = { p: string; c: string; f: string; code?: string };

function mk(level: Level, where: string, x: Parts, line?: number): Finding {
  return { level, where, line, problem: x.p, consequence: x.c, fix: x.f, code: x.code, msg: `${x.p} ${x.c}` };
}
/** Copiable replacement for a "Key = value" line (keys written in their canonical case). */
const kv = (k: string, v: string) => `${CANON[k] ?? k} = ${v}`;

export function checkConfig(text: string): CheckResult {
  const F: Finding[] = [];
  let privEp = false;
  const add = (level: Level, where: string, x: Parts, line?: number) => F.push(mk(level, where, x, line));
  if (text.length > 200_000) return { kind: "unknown", peers: 0, findings: [mk("error", "File", { p: "The file is larger than 200 KB.", c: "It is not analysed: a WireGuard config is a few KB.", f: "Paste only the .conf file, without logs or other files." })] };
  if (text.trim().startsWith("{")) return checkWgEasyJson(text);

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
      else add("error", "File", { p: `Unknown section [${sec[1]}].`, c: "Only [Interface] and [Peer] exist; wg-quick refuses the whole file.", f: "Rename the header to [Interface] or [Peer], or delete the section." }, n);
      pending = "";
      return;
    }
    const eq = line.indexOf("=");
    if (eq < 0) { add("error", "File", { p: `"${line.slice(0, 40)}" is not a "Key = value" line.`, c: "wg-quick stops reading at this line and the interface does not come up.", f: "Write it as Key = value, or comment it out with # at the start of the line." }, n); return; }
    const key = line.slice(0, eq).trim().toLowerCase();
    let value = line.slice(eq + 1).trim();
    const hash = value.indexOf("#");
    if (hash >= 0) value = value.slice(0, hash).trim();
    const cur = sections[sections.length - 1];
    const peerNo = sections.filter((x) => x.name === "peer").length;
    const where = cur?.name === "peer" ? `[Peer] ${peerNo}${cur.label ? ` (${cur.label})` : ""}` : "[Interface]";
    if (!cur) { add("error", "File", { p: `${line.slice(0, eq).trim()} appears before any [Interface] or [Peer] header.`, c: "wg-quick does not know which section it belongs to and refuses the file.", f: "Move the line under the right header; the file starts with [Interface]." }, n); return; }
    const allowed = cur.name === "interface" ? IFACE_KEYS : PEER_KEYS;
    if (!allowed.has(key)) {
      const other = cur.name === "interface" ? PEER_KEYS : IFACE_KEYS;
      add("error", where, other.has(key)
        ? { p: `${CANON[key]} is in the wrong section.`, c: `It belongs in ${cur.name === "interface" ? "a [Peer]" : "[Interface]"}; wg-quick reports "Line unrecognized" and refuses the file.`, f: `Move this line under ${cur.name === "interface" ? "the [Peer] it describes" : "[Interface]"}.` }
        : { p: `Unknown key "${line.slice(0, eq).trim()}" (typo?).`, c: 'wg-quick reports "Line unrecognized" and refuses the file.', f: `Check the spelling. Valid keys here: ${[...allowed].map((k) => CANON[k]).join(", ")}.` }, n);
      return;
    }
    if (SINGLE.has(key) && cur.entries.some((e) => e.key === key)) add("warn", where, { p: `${CANON[key]} is set twice in the same section.`, c: "Only the last value is used; the earlier line is silently ignored.", f: "Delete the line you do not want." }, n);
    cur.entries.push({ key, value, line: n });
  });

  const ifaces = sections.filter((s) => s.name === "interface");
  const peers = sections.filter((s) => s.name === "peer");
  if (ifaces.length === 0) add("error", "File", { p: "No [Interface] section.", c: "Without it there is no key and no address: the file is not a WireGuard config.", f: "Start the file with an [Interface] section.", code: "[Interface]\nPrivateKey = <output of wg genkey>\nAddress = 10.8.0.2/32" });
  if (ifaces.length > 1) add("error", "File", { p: `${ifaces.length} [Interface] sections.`, c: "One file describes one interface; wg-quick refuses the file.", f: "Split it into two files (wg0.conf, wg1.conf), one [Interface] each." }, ifaces[1].line);
  if (peers.length === 0 && ifaces.length) add("warn", "File", { p: "No [Peer] section.", c: "The interface comes up but cannot talk to anyone.", f: "Add one [Peer] per device or server this machine connects to.", code: "[Peer]\nPublicKey = <the other side's public key>\nAllowedIPs = 10.8.0.2/32" });

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
    if (!pk) add("error", W, { p: "PrivateKey is missing.", c: "Without it the interface has no identity and wg-quick refuses to start.", f: "Generate a key with wg genkey and add it under [Interface].", code: "PrivateKey = <output of wg genkey>" }, iface.line);
    else { privKey = pk.value; const p = keyProblem(pk.value); if (p) add("error", W, { p: `PrivateKey ${p}.`, c: 'wg-quick stops with "Key is not the correct length or format".', f: "Copy the key again in full from the source (44 characters ending with =), or generate a new pair with wg genkey | tee priv | wg pubkey." }, pk.line); }

    const addrs = get(iface, "address");
    if (!addrs.length) add(kind === "client" ? "error" : "warn", W, { p: "Address is missing.", c: "The tunnel interface gets no IP, so nothing can be routed through it.", f: kind === "server" ? "Give the server the first address of the tunnel subnet." : "Give this device its own tunnel address, as allowed by the server.", code: kv("address", kind === "server" ? "10.8.0.1/24" : "10.8.0.2/32") }, iface.line);
    for (const a of addrs) for (const c of list(a.value)) {
      const x = v4(c, 32);
      if (x) { ifaceNets.push(x); ifaceIps.push(ipInt(c) as number); }
      else if (!v6ok(c)) add("error", W, { p: `Address "${c}" is not a valid IPv4 or IPv6 address with prefix.`, c: "wg-quick fails when it runs ip address add.", f: "Write an address followed by its prefix.", code: kv("address", "10.8.0.2/32") }, a.line);
    }
    if (kind === "server" && peers.length > 1) {
      const a32 = addrs.find((a) => list(a.value).some((c) => v4(c, 32)?.prefix === 32));
      if (a32) {
        const ip = list(a32.value).find((c) => v4(c, 32)?.prefix === 32)!.split("/")[0];
        add("warn", W, { p: "The server Address uses /32.", c: "The kernel does not route the other tunnel addresses to wg0: clients reach the server but not each other.", f: "Use the prefix of the whole tunnel subnet.", code: kv("address", `${ip}/24`) }, a32.line);
      }
    }

    const lp = one(iface, "listenport");
    if (lp) { const v = Number(lp.value); if (!Number.isInteger(v) || v < 1 || v > 65535) add("error", W, { p: `ListenPort "${lp.value}" is not a port number.`, c: "wg-quick refuses the value and the interface does not come up.", f: "Use a UDP port between 1 and 65535; 51820 is the default.", code: kv("listenport", "51820") }, lp.line); }
    else if (kind === "server") add("warn", W, { p: "ListenPort is missing on a server.", c: "The server picks a random UDP port at each start, so clients cannot reach it reliably.", f: "Fix the port and open it over UDP in the firewall.", code: kv("listenport", "51820") }, iface.line);

    const mtu = one(iface, "mtu");
    if (mtu) {
      const v = Number(mtu.value);
      if (!Number.isInteger(v)) add("error", W, { p: `MTU "${mtu.value}" is not a number.`, c: "wg-quick fails when it sets the link MTU.", f: "Use 1420, or delete the line and let wg-quick compute it.", code: kv("mtu", "1420") }, mtu.line);
      else if (v < 1280) add("error", W, { p: `MTU ${v} is below 1280, the IPv6 minimum.`, c: "IPv6 through the tunnel breaks.", f: "1280 is the safe floor; 1420 is the usual value.", code: kv("mtu", "1280") }, mtu.line);
      else if (v > 1420) add("warn", W, { p: `MTU ${v} is above 1420.`, c: "WireGuard adds 60 to 80 bytes of headers, so on a 1500 link larger packets fragment: pages that load halfway and stalled SSH are the usual symptom.", f: "Use 1420 (1380 behind PPPoE or a mobile network).", code: kv("mtu", "1420") }, mtu.line);
    }

    const dns = get(iface, "dns");
    if (dns.length && kind === "server") add("warn", W, { p: "DNS is set on a server.", c: "wg-quick rewrites the server's own resolver when the tunnel comes up; the server can lose name resolution.", f: "Delete this line here and put DNS in the client files." }, dns[0].line);
    for (const d of dns) for (const c of list(d.value)) if (!v4(c, 32) && !v6ok(c) && !/^[a-zA-Z0-9.-]+$/.test(c)) add("error", W, { p: `DNS entry "${c}" is neither an IP nor a search domain.`, c: "resolvconf rejects it and wg-quick stops.", f: "Use resolver IPs separated by commas.", code: kv("dns", "1.1.1.1, 2606:4700:4700::1111") }, d.line);
    if (dns.length) add("info", W, { p: "On Linux, wg-quick applies this DNS line through resolvconf.", c: 'If resolvconf is missing, wg-quick stops with "resolvconf: command not found".', f: 'Run systemctl is-active systemd-resolved: if active, install its shim (apt install systemd-resolvconf on Debian and Ubuntu); otherwise install openresolv. Or drop the DNS line if this machine should keep its own resolver.' }, dns[0].line);

    const sc = one(iface, "saveconfig");
    if (sc && /^true$/i.test(sc.value)) add("warn", W, { p: "SaveConfig = true.", c: "wg-quick overwrites this file when the interface goes down: edits made by hand while it runs are lost.", f: "Set it to false if you edit the file by hand.", code: kv("saveconfig", "false") }, sc.line);

    const post = get(iface, "postup");
    const masq = post.find((e) => /MASQUERADE/i.test(e.value));
    if (masq) {
      const m = /-o\s+(\S+)/.exec(masq.value);
      if (m) add("info", W, { p: `NAT goes out through "${m[1].replace(/;$/, "")}".`, c: "If that is not the server's real outgoing interface, clients connect but have no internet.", f: 'Compare it with the interface shown by "ip route show default" on the server (often eth0, ens3 or enp1s0).' }, masq.line);
    } else if (kind === "server" && peers.some((p) => get(p, "allowedips").some(() => true))) {
      add("info", W, { p: "No MASQUERADE rule in PostUp.", c: "Fine for a site-to-site or LAN-only tunnel; full-tunnel clients have no internet access without NAT.", f: "For full tunnel, add NAT and enable forwarding (sysctl -w net.ipv4.ip_forward=1). Replace eth0 with the interface of ip route show default.", code: "PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE\nPostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE" });
    }
  }

  const seenKeys = new Map<string, number>();
  const routes: Array<{ net: V4; peer: number; line: number }> = [];
  peers.forEach((p, i) => {
    const W = `[Peer] ${i + 1}${p.label ? ` (${p.label})` : ""}`;
    const pub = one(p, "publickey");
    if (!pub) add("error", W, { p: "PublicKey is missing.", c: "wg-quick refuses a peer without one.", f: "Paste the other side's public key (wg pubkey < its private key).", code: "PublicKey = <the other side's public key>" }, p.line);
    else {
      const pr = keyProblem(pub.value);
      if (pr) add("error", W, { p: `PublicKey ${pr}.`, c: 'wg-quick stops with "Key is not the correct length or format".', f: "Copy the public key again in full from the other device (44 characters ending with =)." }, pub.line);
      if (privKey && pub.value === privKey) add("error", W, { p: "PublicKey is the same string as your [Interface] PrivateKey.", c: "You pasted the private key where the other side's public key goes: the handshake can never succeed, and the private key is exposed.", f: "Replace it with the other side's public key, and generate a new key pair for this interface." }, pub.line);
      if (seenKeys.has(pub.value)) add("error", W, { p: `Same PublicKey as peer ${seenKeys.get(pub.value)}.`, c: "wg keeps only one of them: one device will never connect.", f: "Each device needs its own key pair: generate one for this device and paste its public key here." }, pub.line);
      else seenKeys.set(pub.value, i + 1);
    }
    const psk = one(p, "presharedkey");
    if (psk) { const pr = keyProblem(psk.value); if (pr) add("error", W, { p: `PresharedKey ${pr}.`, c: "wg-quick refuses the key.", f: "Copy it again in full, or generate one with wg genpsk and put the same value on both sides." }, psk.line); }

    const aips = get(p, "allowedips");
    if (!aips.length) add("warn", W, { p: "AllowedIPs is missing.", c: "No traffic is accepted from or sent to this peer.", f: kind === "client" ? "For a full tunnel:" : "Give this peer its tunnel address:", code: kv("allowedips", kind === "client" ? "0.0.0.0/0, ::/0" : "10.8.0.2/32") }, p.line);
    const all = aips.flatMap((a) => list(a.value).map((c) => ({ c, line: a.line })));
    let v4full = false, v6full = false;
    for (const { c, line } of all) {
      if (c === "::/0") v6full = true;
      const x = v4(c, 32);
      if (x) {
        if (x.prefix === 0) v4full = true;
        if (x.hostBits) {
          const host = `${c.split("/")[0]}/32`;
          add("warn", W, kind === "server"
            ? { p: `AllowedIPs ${c} has host bits set.`, c: `wg turns it into ${fmt(x)}: the server sends the whole range to this one peer.`, f: "A single client takes a /32.", code: kv("allowedips", all.filter((y) => y.line === line).map((y) => (y.c === c ? host : y.c)).join(", ")) }
            : { p: `AllowedIPs ${c} has host bits set.`, c: `wg silently turns it into ${fmt(x)}.`, f: "Write the network address.", code: kv("allowedips", all.filter((y) => y.line === line).map((y) => (y.c === c ? fmt(x) : y.c)).join(", ")) }, line);
        }
        routes.push({ net: x, peer: i + 1, line });
        if (kind === "server" && x.prefix === 32 && ifaceIps.includes(x.base)) add("error", W, { p: `AllowedIPs ${c} is the server's own tunnel address.`, c: "Traffic for the server itself is sent to this peer.", f: "Give this peer its own free address in the subnet." }, line);
        if (kind === "server" && x.prefix === 32 && ifaceNets.length && !ifaceNets.some((n) => overlap(n, x))) add("warn", W, { p: `${c} is outside the server subnet (${ifaceNets.map(fmt).join(", ")}).`, c: "It works only if the client uses that address and you route it yourself.", f: "Use an address inside the server subnet, and the same one in the client's Address." }, line);
      } else if (!v6ok(c)) add("error", W, { p: `AllowedIPs entry "${c}" is not a valid address with prefix.`, c: "wg-quick refuses the file.", f: "Write each entry as address/prefix, separated by commas." }, line);
    }
    if (kind === "server" && v4full && peers.length > 1) add("error", W, { p: "AllowedIPs 0.0.0.0/0 on a server peer.", c: "It routes ALL traffic to this one peer and starves the others.", f: "Give each client its own /32 (0.0.0.0/0 belongs in the client file).", code: kv("allowedips", "10.8.0.2/32") }, aips[0]?.line);

    const ep = one(p, "endpoint");
    if (ep) {
      const m = /^(\[[0-9a-fA-F:.]+\]|[^:\s]+):(\d{1,5})$/.exec(ep.value);
      if (!m) add("error", W, { p: `Endpoint "${ep.value}" is not host:port.`, c: "wg-quick refuses the file.", f: "Write the server name or IP, a colon, then the UDP port (IPv6 in brackets: [2001:db8::1]:51820).", code: kv("endpoint", `${ep.value.split(":")[0] || "vpn.example.com"}:51820`) }, ep.line);
      else {
        const port = Number(m[2]);
        if (port < 1 || port > 65535) add("error", W, { p: `Endpoint port ${port} is out of range.`, c: "wg-quick refuses the value.", f: "Use the server's ListenPort, usually 51820.", code: kv("endpoint", `${m[1]}:51820`) }, ep.line);
        const ipn = ipInt(m[1]);
        if (ipn !== null && isPrivate(ipn)) privEp = true;
        if (ipn !== null && isPrivate(ipn)) add("warn", W, { p: `Endpoint ${m[1]} is a private address.`, c: "This config only works from inside that network, not from mobile data or another Wi-Fi.", f: "Put the public IP or a dynamic DNS name of the server, with the UDP port forwarded on the router.", code: kv("endpoint", `your-name.duckdns.org:${m[2]}`) }, ep.line);
      }
    } else if (kind === "client") add("error", W, { p: "Endpoint is missing.", c: "A client without Endpoint can never start the handshake.", f: "Add the server's public address and UDP port.", code: kv("endpoint", "vpn.example.com:51820") }, p.line);

    const ka = one(p, "persistentkeepalive");
    if (ka) {
      const v = /^off$/i.test(ka.value) ? 0 : Number(ka.value);
      if (!Number.isInteger(v) || v < 0 || v > 65535) add("error", W, { p: `PersistentKeepalive "${ka.value}" is not valid.`, c: "wg-quick refuses the value.", f: 'Use 0 to 65535 seconds or "off"; 25 is the usual value.', code: kv("persistentkeepalive", "25") }, ka.line);
      else if (v > 0 && v < 10) add("warn", W, { p: `PersistentKeepalive ${v} s is very short.`, c: "Battery and data cost on phones for no gain.", f: "25 seconds keeps NAT mappings open.", code: kv("persistentkeepalive", "25") }, ka.line);
    } else if (kind === "client") add("info", W, { p: "No PersistentKeepalive.", c: "Behind NAT (home router, mobile data) the tunnel goes silent after idle and the server cannot reach you.", f: "Add it under this [Peer] if the server must reach this device.", code: kv("persistentkeepalive", "25") }, p.line);

    if (kind === "client" && v4full && !v6full) {
      const l = aips.find((a) => list(a.value).includes("0.0.0.0/0"));
      add("warn", W, { p: "Full tunnel for IPv4 (0.0.0.0/0) but not IPv6.", c: "On a network with IPv6, part of your traffic leaves outside the tunnel.", f: "Add ::/0 to AllowedIPs.", code: kv("allowedips", [...list(l?.value ?? "0.0.0.0/0"), "::/0"].join(", ")) }, l?.line ?? aips[0]?.line);
    }
    if (kind === "client" && (v4full || v6full) && iface && !get(iface, "dns").length) add("warn", "[Interface]", { p: "Full tunnel without DNS.", c: "Name lookups still go to the local network's resolver: a DNS leak.", f: "Add a resolver under [Interface].", code: kv("dns", "1.1.1.1, 2606:4700:4700::1111") }, iface.line);
  });

  if (kind === "server") {
    for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
      const r1 = routes[a], r2 = routes[b];
      if (r1.peer !== r2.peer && overlap(r1.net, r2.net)) {
        // Point at the wider range: it is almost always the line to change (a client given a /24 instead of a /32).
        const wide = r1.net.prefix <= r2.net.prefix ? r1 : r2, narrow = wide === r1 ? r2 : r1;
        add("error", `[Peer] ${wide.peer}`, { p: `AllowedIPs ${fmt(wide.net)} of peer ${wide.peer} overlaps ${fmt(narrow.net)} of peer ${narrow.peer}.`, c: `wg gives the shared addresses to the last peer loaded, so peer ${r1.peer} silently stops receiving that traffic: the classic "handshake OK, no traffic" bug.`, f: wide.net.prefix < 32 ? `Narrow peer ${wide.peer} to its single address with /32, so the two ranges are distinct.` : "Give each client its own /32, so the two ranges are distinct." }, wide.line);
      }
    }
  }

  // One line, one fix: an error and a warning on the same line become one finding (the error keeps the warning's copiable line).
  for (const e of F.filter((x) => x.level === "error" && x.line)) {
    const w = F.find((x) => x.level === "warn" && x.line === e.line && x.code);
    if (!w) continue;
    if (!e.code) { e.code = w.code; e.fix = `${e.fix} ${w.fix}`; }
    F.splice(F.indexOf(w), 1);
  }
  const order: Record<Level, number> = { error: 0, warn: 1, info: 2 };
  F.sort((x, y) => order[x.level] - order[y.level] || (x.line ?? 0) - (y.line ?? 0));
  return { kind, peers: peers.length, findings: F, privateEndpoint: privEp };
}

/** wg-easy v14 keeps its state in /etc/wireguard/wg0.json (also what its Backup button downloads). wg-quick never reads
 *  it, so it is recognised and described instead of being reported as a broken config. */
function checkWgEasyJson(text: string): CheckResult {
  let j: { server?: { privateKey?: unknown; address?: unknown }; clients?: Record<string, { enabled?: unknown }> };
  const notConf = (p: string) => ({ kind: "unknown" as const, peers: 0, findings: [mk("error", "File", { p, c: "wg-quick only reads an INI-style text file starting with [Interface].", f: "Paste the wg0.conf (server) or the client .conf instead." })] });
  try { j = JSON.parse(text); } catch { return notConf("This starts like JSON but is not valid JSON."); }
  if (!j?.server || typeof j.server.privateKey !== "string" || typeof j.clients !== "object") return notConf("This is JSON, not a WireGuard config.");
  const all = Object.values(j.clients ?? {});
  const on = all.filter((c) => c?.enabled !== false).length;
  const F: Finding[] = [mk("info", "File", { p: "This is wg-easy's wg0.json (v14 and earlier, or its Backup download).", c: `wg-quick does not read it. It holds the server key, ${all.length} client${all.length === 1 ? "" : "s"} (${on} enabled) with their own private keys, and their addresses.`, f: "Import it below to get a wg0.conf and one .conf per device." })];
  if (!/^[A-Za-z0-9+/]{43}=$/.test(j.server.privateKey)) F.push(mk("error", "server", { p: "server.privateKey is not a valid WireGuard key.", c: "The server key cannot be recovered from this file.", f: "Take a fresh Backup from the wg-easy panel." }));
  return { kind: "wg-easy", peers: on, findings: F };
}
