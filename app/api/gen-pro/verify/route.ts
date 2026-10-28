import { NextResponse } from "next/server";
import { GEN_PROJECT, SESSION_RE, cors } from "@/lib/genpro";
import { recordHit } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** GET ?s=<Checkout session id>: { pro: true } only for a paid, non-refunded WireGuard Pro session. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get("s") ?? "";
  const sk = process.env.STRIPE_SECRET_KEY;
  // ?s=cancel: the generator pings this once when a buyer comes back from Checkout with the back arrow
  // (cancel_url), so "saw the price and left" is counted apart from "closed the tab" (9 sessions, 0 paid by 28/10).
  if (s === "cancel") {
    await recordHit("/gen-pro:cancel-back", null).catch(() => {});
    return NextResponse.json({ pro: false }, { headers: { ...cors(), "Cache-Control": "no-store" } });
  }
  if (!SESSION_RE.test(s) || !sk) return NextResponse.json({ pro: false }, { headers: cors() });
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${s}?expand[]=payment_intent.latest_charge`, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  const j = (await r.json().catch(() => ({}))) as {
    payment_status?: string;
    metadata?: Record<string, string>;
    payment_intent?: { latest_charge?: { refunded?: boolean } } | string | null;
  };
  const refunded = typeof j.payment_intent === "object" && !!j.payment_intent?.latest_charge?.refunded;
  const pro = r.ok && j.payment_status === "paid" && j.metadata?.projet === GEN_PROJECT && !refunded;
  if (pro) await recordHit("/gen-pro:verified", null).catch(() => {});
  return NextResponse.json({ pro }, { headers: { ...cors(), "Cache-Control": "no-store" } });
}
