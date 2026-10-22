import { recordHit } from "@/lib/stats";

/** Peer count bucket: tells how many checker users already run more peers than the free plan holds. */
function bucket(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "p0";
  if (n <= 3) return "p1-3";
  if (n <= 10) return "p4-10";
  return "p11+";
}

/** Counts one checker run, or one click on "Import this wg0.conf". The config itself is never sent: the check runs in the browser. */
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind");
  const peers = q.has("peers") ? `-${bucket(Number(q.get("peers")))}` : "";
  if (kind === "import") await recordHit(`/check:import${peers}`);
  else await recordHit(kind === "server" || kind === "client" ? `/check:run-${kind}${kind === "server" ? peers : ""}` : "/check:run");
  return new Response(null, { status: 204 });
}
