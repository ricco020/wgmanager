import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";
import { GEN_PROJECT, GEN_PRICE_CENTS, genUrl } from "@/lib/genpro";
import { recordHit } from "@/lib/stats";

export const dynamic = "force-dynamic";

const SRC_RE = /^[a-z0-9-]{1,40}$/;

/** Form POST from the VPNSmith generator: creates a one-time Checkout session and sends the
 *  visitor to Stripe; the success URL brings them back to the generator with the session id. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const locale = String(form?.get("locale") ?? "en");
  const srcRaw = String(form?.get("src") ?? "gen").toLowerCase();
  const src = SRC_RE.test(srcRaw) ? srcRaw : "gen";
  const back = genUrl(locale);
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return NextResponse.redirect(`${back}?wgpro=unavailable#pro`, 303);
  await recordHit(`/gen-pro:checkout-${src}`, null).catch(() => {});
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(GEN_PRICE_CENTS),
    "line_items[0][price_data][product_data][name]": "WireGuard Pro (config generator, one-time)",
    "line_items[0][price_data][product_data][description]":
      "Up to 250 clients per generation and one ZIP with every .conf and its QR code. Keys stay in your browser.",
    "line_items[0][quantity]": "1",
    "metadata[projet]": GEN_PROJECT,
    "metadata[src]": src,
    "payment_intent_data[metadata][projet]": GEN_PROJECT,
    locale: ["fr", "es", "de", "it", "pt"].includes(locale) ? locale : "en",
    success_url: `${back}?wgpro={CHECKOUT_SESSION_ID}#pro`,
    cancel_url: `${back}?wgpro=cancel#pro`,
    "consent_collection[terms_of_service]": "required",
    "custom_text[terms_of_service_acceptance][message]":
      `I agree to the [terms of sale](${SITE}/terms#generator-pro) and ask for immediate access, which ends my right of withdrawal.`,
  };
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!r.ok || !j.url) {
    console.log("gen-pro checkout failed", r.status, j.error?.message);
    return NextResponse.redirect(`${back}?wgpro=unavailable#pro`, 303);
  }
  return NextResponse.redirect(j.url, 303);
}
