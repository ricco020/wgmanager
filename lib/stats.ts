import { headers } from "next/headers";
import { db } from "./db";

const BOT_RE = /bot|crawl|spider|slurp|curl|wget|python-requests|httpx|go-http-client|headless|lighthouse|facebookexternalhit|preview/i;
const REF_RE = /^[a-z0-9-]{1,40}$/;

export function cleanRef(v: string | undefined | null): string {
  const r = (v ?? "").trim().toLowerCase();
  return REF_RE.test(r) ? r : "";
}

/** Counts one page view. Aggregated by day, path and ref: nothing personal is stored.
 *  Known crawlers and command-line clients are skipped so the table reflects people. */
export async function recordHit(path: string, ref?: string | null): Promise<void> {
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    if (!ua || BOT_RE.test(ua)) return;
    // Scripted clients that borrow a browser user agent: a real Chrome or Firefox always sends Sec-Fetch-Mode, and a
    // navigation without user activation lacks Sec-Fetch-User ?1. An outbound /out link is only ever reached by a click on
    // one of our pages (Sec-Fetch-Site same-origin); opened directly (none) or from elsewhere it is a link checker: on 20/11
    // such a pass hit every /out link of /, /pricing and /allowedips the same number of times (home-hp 8 = home-hg 8) and
    // would have read as affiliate demand. Browsers without Sec-Fetch headers (Safari before 16.4) still count.
    const mode = h.get("sec-fetch-mode");
    if (!mode && /Chrome\/|Firefox\//.test(ua)) return;
    if (mode === "navigate" && h.get("sec-fetch-user") !== "?1") return;
    const site = h.get("sec-fetch-site");
    if (path.startsWith("/out:") && site && site !== "same-origin" && site !== "same-site") return;
    const day = new Date().toISOString().slice(0, 10);
    const r = cleanRef(ref) || cleanRef(h.get("cookie")?.match(/(?:^|;\s*)wg_ref=([^;]*)/)?.[1]);
    await db.hit.upsert({
      where: { day_path_ref: { day, path, ref: r } },
      create: { day, path, ref: r, n: 1 },
      update: { n: { increment: 1 } },
    });
  } catch (e) {
    console.error("hit", (e as Error).message);
  }
}

/** Peer count bucket used by every counter: tells how many visitors already run more peers than the free plan holds. */
export function peerBucket(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "p0";
  if (n <= 3) return "p1-3";
  if (n <= 10) return "p4-10";
  return "p11+";
}
