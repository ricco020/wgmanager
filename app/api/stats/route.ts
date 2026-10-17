import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Product metrics for the operator (NDD/scripts/wgmanager-stats.py). Key in STATS_KEY. */
export async function GET(req: Request) {
  const key = process.env.STATS_KEY;
  const given = req.headers.get("x-stats-key") ?? "";
  if (!key || key.length < 16) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const a = Buffer.from(key), b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const now = new Date();
  const [users, pro, servers, peers, hits, byRef] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { proUntil: { gt: now } } }),
    db.server.count(),
    db.peer.count(),
    db.hit.findMany({ where: { day: { gte: since } }, orderBy: [{ day: "asc" }, { path: "asc" }] }),
    db.user.groupBy({ by: ["ref"], _count: { _all: true } }),
  ]);
  const days: Record<string, Record<string, number>> = {};
  const refs: Record<string, number> = {};
  for (const h of hits) {
    (days[h.day] ??= {})[h.path] = ((days[h.day] ?? {})[h.path] ?? 0) + h.n;
    refs[h.ref || "(direct)"] = (refs[h.ref || "(direct)"] ?? 0) + h.n;
  }
  return NextResponse.json({
    at: now.toISOString(),
    users, pro, servers, peers,
    hitsByDay: days,
    hitsByRef: refs,
    signupsByRef: Object.fromEntries(byRef.map((r) => [r.ref ?? "(direct)", r._count._all])),
  });
}
