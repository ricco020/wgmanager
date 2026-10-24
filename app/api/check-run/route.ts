import { peerBucket as bucket, recordHit } from "@/lib/stats";

/** Counts one checker run, or one click on "Import this wg0.conf". The config itself is never sent: the check runs in the browser. */
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind");
  const peers = q.has("peers") ? `-${bucket(Number(q.get("peers")))}` : "";
  if (q.get("from") === "gen") await recordHit(`/check:from-gen${peers}`);
  if (kind === "import") await recordHit(`/check:import${peers}`);
  else if (kind === "allowedips") await recordHit("/allowedips:run");
  else if (kind === "qr" || kind === "qr-errors" || kind === "qr-server") await recordHit(`/qr:${kind === "qr" ? "run" : kind.slice(3)}`);
  else if (kind === "addpeer") await recordHit(`/check:addpeer${peers}`);
  else await recordHit(kind === "server" || kind === "client" ? `/check:run-${kind}${kind === "server" ? peers : ""}` : "/check:run");
  return new Response(null, { status: 204 });
}
