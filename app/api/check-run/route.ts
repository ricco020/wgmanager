import { recordHit } from "@/lib/stats";

/** Counts one checker run. The config itself is never sent: the check runs in the browser. */
export async function POST(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  await recordHit(kind === "server" || kind === "client" ? `/check:run-${kind}` : "/check:run");
  return new Response(null, { status: 204 });
}
