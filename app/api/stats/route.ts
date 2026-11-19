import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { FREE_LIMITS, TRIAL_DAYS } from "@/lib/site";

export const dynamic = "force-dynamic";

function authorized(req: Request): NextResponse | null {
  const key = process.env.STATS_KEY;
  const given = req.headers.get("x-stats-key") ?? "";
  if (!key || key.length < 16) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const a = Buffer.from(key), b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

/** example.com is reserved (RFC 2606): accounts there are our own production checks, never customers. */
const TEST_EMAIL = { endsWith: "@example.com" };

/** Product metrics for the operator (NDD/scripts/wgmanager-stats.py). Key in STATS_KEY. Test accounts excluded. */
export async function GET(req: Request) {
  const denied = authorized(req);
  if (denied) return denied;

  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const now = new Date();
  const [users, pro, servers, peers, hits, byRef] = await Promise.all([
    db.user.count({ where: { NOT: { email: TEST_EMAIL } } }),
    db.user.count({ where: { proUntil: { gt: now }, NOT: { email: TEST_EMAIL } } }),
    db.server.count({ where: { user: { NOT: { email: TEST_EMAIL } } } }),
    db.peer.count({ where: { server: { user: { NOT: { email: TEST_EMAIL } } } } }),
    db.hit.findMany({ where: { day: { gte: since } }, orderBy: [{ day: "asc" }, { path: "asc" }] }),
    db.user.groupBy({ by: ["ref"], _count: { _all: true }, where: { NOT: { email: TEST_EMAIL } } }),
  ]);
  // Paywall funnel (19/11/2026, ndd-saas-2): only an account above the free limits can need Pro,
  // so count them, split by trial state. No email leaves the server: counts and day buckets only.
  const accounts = await db.user.findMany({
    where: { NOT: { email: TEST_EMAIL } },
    select: { createdAt: true, proUntil: true, servers: { select: { _count: { select: { peers: true } } } } },
  });
  const funnel = { inTrial: 0, trialEnded: 0, withServer: 0, aboveFreeInTrial: 0, aboveFreeAfterTrial: 0, atPeerLimit: 0,
    trialEndsNext7d: 0, peersMax: 0 };
  for (const a of accounts) {
    const end = a.createdAt.getTime() + TRIAL_DAYS * 86400000;
    const trial = end > now.getTime();
    const nPeers = a.servers.reduce((t, s) => t + s._count.peers, 0);
    const above = a.servers.length > FREE_LIMITS.servers || nPeers > FREE_LIMITS.peers;
    if (trial) funnel.inTrial++; else funnel.trialEnded++;
    if (a.servers.length > 0) funnel.withServer++;
    if (above && trial) funnel.aboveFreeInTrial++;
    if (above && !trial) funnel.aboveFreeAfterTrial++;
    if (!above && nPeers === FREE_LIMITS.peers) funnel.atPeerLimit++;
    if (trial && end - now.getTime() < 7 * 86400000) funnel.trialEndsNext7d++;
    funnel.peersMax = Math.max(funnel.peersMax, nPeers);
  }
  const days: Record<string, Record<string, number>> = {};
  const refs: Record<string, number> = {};
  for (const h of hits) {
    (days[h.day] ??= {})[h.path] = ((days[h.day] ?? {})[h.path] ?? 0) + h.n;
    refs[h.ref || "(direct)"] = (refs[h.ref || "(direct)"] ?? 0) + h.n;
  }
  return NextResponse.json({
    at: now.toISOString(),
    users, pro, servers, peers, funnel,
    hitsByDay: days,
    hitsByRef: refs,
    signupsByRef: Object.fromEntries(byRef.map((r) => [r.ref ?? "(direct)", r._count._all])),
  });
}

/** Operator cleanup after a production check: removes the @example.com accounts (servers and peers cascade). */
export async function DELETE(req: Request) {
  const denied = authorized(req);
  if (denied) return denied;
  const r = await db.user.deleteMany({ where: { email: TEST_EMAIL } });
  return NextResponse.json({ deletedTestAccounts: r.count });
}
