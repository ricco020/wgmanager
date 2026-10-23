/**
 * CIDR arithmetic for the AllowedIPs calculator: allowed ranges minus excluded ranges,
 * returned as the shortest list of CIDR blocks. IPv4 and IPv6, BigInt ranges, no dependency.
 */

export type Family = 4 | 6;
export type Range = { fam: Family; lo: bigint; hi: bigint };

const BITS: Record<Family, number> = { 4: 32, 6: 128 };

function parseV4(s: string): bigint | null {
  const p = s.split(".");
  if (p.length !== 4) return null;
  let v = 0n;
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return null;
    v = (v << 8n) | BigInt(Number(x));
  }
  return v;
}

function parseV6(s: string): bigint | null {
  if (!/^[0-9a-fA-F:]+$/.test(s) || s.split("::").length > 2) return null;
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  if (tail === null && h.length !== 8) return null;
  if (tail !== null && h.length + t.length > 7) return null;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  let v = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    v = (v << 16n) | BigInt(parseInt(g, 16));
  }
  return v;
}

/** Parses "10.0.0.0/8", "192.168.1.10" (host, /32) or "fd00::/8". Host bits are dropped (wg does the same). */
export function parseCidr(raw: string): Range | { error: string } {
  const s = raw.trim();
  const [addr, len, extra] = s.split("/");
  if (extra !== undefined || !addr) return { error: `"${s}" is not a CIDR block` };
  const fam: Family = addr.includes(":") ? 6 : 4;
  const v = fam === 4 ? parseV4(addr) : parseV6(addr);
  if (v === null) return { error: `"${s}": invalid IPv${fam} address` };
  const bits = BITS[fam];
  const n = len === undefined ? bits : /^\d{1,3}$/.test(len) ? Number(len) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > bits) return { error: `"${s}": prefix must be 0 to ${bits}` };
  const size = 1n << BigInt(bits - n);
  const lo = v - (v % size);
  return { fam, lo, hi: lo + size - 1n };
}

/** Splits a free-form list (commas, spaces, new lines) into CIDR blocks. */
export function parseList(text: string): { ranges: Range[]; errors: string[] } {
  const ranges: Range[] = [];
  const errors: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const r = parseCidr(tok);
    if ("error" in r) errors.push(r.error);
    else ranges.push(r);
  }
  return { ranges, errors };
}

function subtractOne(a: Range[], x: Range): Range[] {
  const out: Range[] = [];
  for (const r of a) {
    if (r.fam !== x.fam || x.hi < r.lo || x.lo > r.hi) { out.push(r); continue; }
    if (x.lo > r.lo) out.push({ fam: r.fam, lo: r.lo, hi: x.lo - 1n });
    if (x.hi < r.hi) out.push({ fam: r.fam, lo: x.hi + 1n, hi: r.hi });
  }
  return out;
}

function merge(rs: Range[]): Range[] {
  const s = [...rs].sort((a, b) => a.fam - b.fam || (a.lo < b.lo ? -1 : a.lo > b.lo ? 1 : 0));
  const out: Range[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && last.fam === r.fam && r.lo <= last.hi + 1n) { if (r.hi > last.hi) last.hi = r.hi; }
    else out.push({ ...r });
  }
  return out;
}

/** Shortest list of CIDR blocks covering exactly [lo, hi]. */
function toCidrs(r: Range): Array<{ fam: Family; addr: bigint; len: number }> {
  const bits = BITS[r.fam];
  const out: Array<{ fam: Family; addr: bigint; len: number }> = [];
  let lo = r.lo;
  while (lo <= r.hi) {
    let k = 0;
    while (k < bits) {
      const size = 1n << BigInt(k + 1);
      if (lo % size !== 0n || lo + size - 1n > r.hi) break;
      k++;
    }
    out.push({ fam: r.fam, addr: lo, len: bits - k });
    lo += 1n << BigInt(k);
  }
  return out;
}

function fmtV4(v: bigint): string {
  return [24n, 16n, 8n, 0n].map((s) => String((v >> s) & 255n)).join(".");
}

function fmtV6(v: bigint): string {
  const g: number[] = [];
  for (let i = 7; i >= 0; i--) g.push(Number((v >> BigInt(i * 16)) & 0xffffn));
  // RFC 5952: compress the longest run of two or more zero groups.
  let bs = -1, bl = 0;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bl && j - i >= 2) { bs = i; bl = j - i; }
    i = j;
  }
  const hex = g.map((x) => x.toString(16));
  if (bs < 0) return hex.join(":");
  return `${hex.slice(0, bs).join(":")}::${hex.slice(bs + bl).join(":")}`;
}

export function fmtCidr(c: { fam: Family; addr: bigint; len: number }): string {
  return `${c.fam === 4 ? fmtV4(c.addr) : fmtV6(c.addr)}/${c.len}`;
}

/** AllowedIPs = allowed minus excluded, as CIDR strings (IPv4 first, then IPv6). */
export function computeAllowedIps(allowed: Range[], excluded: Range[], keep: Range[] = []): string[] {
  let cur = merge(allowed);
  for (const x of excluded) cur = subtractOne(cur, x);
  // The tunnel subnet often sits inside an excluded private range (10.8.0.0/24 in 10.0.0.0/8): put it back.
  return merge([...cur, ...keep]).flatMap(toCidrs).map(fmtCidr);
}

/** Private and link-local ranges a "full tunnel, LAN still reachable" peer keeps outside the tunnel. */
export const LAN_RANGES = "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, fc00::/7, fe80::/10";

/** 0.0.0.0/0, ::/0 minus LAN_RANGES: printers, NAS and the router stay reachable while everything else goes through the VPN. */
export function fullTunnelExceptLan(tunnelSubnet = ""): string {
  return computeAllowedIps(parseList("0.0.0.0/0, ::/0").ranges, parseList(LAN_RANGES).ranges, parseList(tunnelSubnet).ranges).join(", ");
}
