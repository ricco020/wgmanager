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
  return start(String(form?.get("locale") ?? "en"), String(form?.get("src") ?? "gen"));
}

/** GET ?locale=&src= : plain link from the generator (vpnsmith's CSP allows form-action 'self' only,
 *  so a cross-origin form POST is blocked by the browser). /api is disallowed in robots.txt. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return start(q.get("locale") ?? "en", q.get("src") ?? "gen");
}

async function start(locale: string, srcIn: string) {
  const srcRaw = srcIn.toLowerCase();
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
    // The account-wide name is "Web services": a buyer coming from the generator must see the product
    // they clicked, in the generator's orange, or the page reads like a third-party payment form.
    "branding_settings[display_name]": "WireGuard Manager",
    "branding_settings[button_color]": "#ea580c",
    submit_type: "pay",
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
