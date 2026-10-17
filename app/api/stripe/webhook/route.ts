import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { PROJECT, refreshPro } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function signatureValid(raw: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected, "utf8"), b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Subscription events refresh proUntil from Stripe (idempotent: we re-read the state, we do not apply deltas). */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const raw = await req.text();
  const header = req.headers.get("stripe-signature");
  if (!header || !signatureValid(raw, header, secret)) return NextResponse.json({ error: "signature" }, { status: 400 });

  let evt: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "body" }, { status: 400 }); }
  const obj = evt.data?.object ?? {};
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.projet && meta.projet !== PROJECT) return NextResponse.json({ received: true, ignored: "other project" });

  const customer = typeof obj.customer === "string" ? obj.customer : undefined;
  if (customer && (evt.type ?? "").startsWith("customer.subscription.")) {
    const user = await db.user.findUnique({ where: { stripeCustomerId: customer } });
    if (user) await refreshPro(user);
  }
  console.log("webhook", JSON.stringify({ id: evt.id, type: evt.type, object: obj.id }));
  return NextResponse.json({ received: true });
}
