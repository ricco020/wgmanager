import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";
import { GEN_PROJECT, GEN_PRICE_CENTS, genUrl } from "@/lib/genpro";
import { recordHit } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Checkout copy in the generator's language (the refund line repeats the generator box and /terms#generator-pro): 1 of the 4 human sessions on 27/10 came from /it and
 *  saw an English-only payment page. FR uses "tu" like the vpnsmith generator page. */
const COPY: Record<string, { name: string; desc: string; terms: string; submit: string }> = {
  en: {
    name: "WireGuard config generator Pro",
    desc: "Keys stay in your browser. Up to 250 clients, one ZIP with every .conf and its QR code.",
    terms: "I agree to the [terms of sale](TERMS) and ask for immediate access, which ends my right of withdrawal.",
    submit: "9 EUR once. No subscription, no account. Pro unlocks when you are back on the generator. Guarantee: refund within 14 days if the export does not work for you.",
  },
  fr: {
    name: "Générateur de configs WireGuard Pro",
    desc: "Les clés restent dans ton navigateur. Jusqu'à 250 clients, un ZIP avec chaque .conf et son QR code.",
    terms: "J'accepte les [conditions de vente](TERMS) et demande l'accès immédiat, ce qui met fin à mon droit de rétractation.",
    submit: "9 EUR une seule fois. Sans abonnement ni compte. Pro s'active à ton retour sur le générateur. Garantie : remboursé sous 14 jours si l'export ne te convient pas.",
  },
  es: {
    name: "Generador de configuraciones WireGuard Pro",
    desc: "Las claves no salen de tu navegador. Hasta 250 clientes, un ZIP con cada .conf y su código QR.",
    terms: "Acepto las [condiciones de venta](TERMS) y solicito el acceso inmediato, lo que pone fin a mi derecho de desistimiento.",
    submit: "9 EUR una sola vez. Sin suscripción ni cuenta. Pro se activa al volver al generador. Garantía: reembolso en 14 días si la exportación no te sirve.",
  },
  de: {
    name: "WireGuard-Konfigurationsgenerator Pro",
    desc: "Die Schlüssel bleiben in deinem Browser. Bis zu 250 Clients, ein ZIP mit jeder .conf und ihrem QR-Code.",
    terms: "Ich akzeptiere die [Verkaufsbedingungen](TERMS) und verlange den sofortigen Zugang, wodurch mein Widerrufsrecht erlischt.",
    submit: "9 EUR einmalig. Kein Abo, kein Konto. Pro ist aktiv, sobald du zum Generator zurückkehrst. Garantie: Erstattung innerhalb von 14 Tagen, wenn der Export nicht funktioniert.",
  },
  it: {
    name: "Generatore di configurazioni WireGuard Pro",
    desc: "Le chiavi restano nel tuo browser. Fino a 250 client, uno ZIP con ogni .conf e il suo codice QR.",
    terms: "Accetto le [condizioni di vendita](TERMS) e chiedo l'accesso immediato, che pone fine al mio diritto di recesso.",
    submit: "9 EUR una sola volta. Nessun abbonamento né account. Pro si attiva quando torni al generatore. Garanzia: rimborso entro 14 giorni se l'esportazione non funziona.",
  },
  pt: {
    name: "Gerador de configurações WireGuard Pro",
    desc: "As chaves ficam no seu navegador. Até 250 clientes, um ZIP com cada .conf e o seu código QR.",
    terms: "Aceito as [condições de venda](TERMS) e peço o acesso imediato, o que põe fim ao meu direito de arrependimento.",
    submit: "9 EUR uma só vez. Sem assinatura nem conta. O Pro é ativado quando voltar ao gerador. Garantia: reembolso em 14 dias se a exportação não funcionar.",
  },
};

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
  const lang = locale in COPY ? locale : "en";
  const c = COPY[lang];
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return NextResponse.redirect(`${back}?wgpro=unavailable#pro`, 303);
  await recordHit(`/gen-pro:checkout-${src}`, null).catch(() => {});
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(GEN_PRICE_CENTS),
    "line_items[0][price_data][product_data][name]": c.name,
    "line_items[0][price_data][product_data][description]": c.desc,
    "line_items[0][quantity]": "1",
    "metadata[projet]": GEN_PROJECT,
    "metadata[src]": src,
    "payment_intent_data[metadata][projet]": GEN_PROJECT,
    locale: lang,
    success_url: `${back}?wgpro={CHECKOUT_SESSION_ID}#pro`,
    cancel_url: `${back}?wgpro=cancel#pro`,
    // The account-wide name is "Web services": a buyer coming from the generator must see the product
    // they clicked, in a darker orange than the generator's (contrast with Stripe's white text, design judge 27/10), or the page reads like a third-party payment form.
    "branding_settings[display_name]": "WireGuard Manager",
    "branding_settings[button_color]": "#c2410c",
    submit_type: "pay",
    "consent_collection[terms_of_service]": "required",
    "custom_text[terms_of_service_acceptance][message]": c.terms.replace("TERMS", `${SITE}/terms#generator-pro`),
    "custom_text[submit][message]": c.submit,
  };
  // The account's default payment method configuration leaves out Klarna although the capability is active
  // (probe 27/10), and 3 of the first 5 buyers came from DE/IT, where Klarna is a common way to pay.
  // PayPal is not activated on the account. Card brings Apple Pay and Google Pay along.
  ["card", "link", "klarna", "bancontact", "eps", "ideal", "p24", "mobilepay"].forEach((t, i) => {
    params[`payment_method_types[${i}]`] = t;
  });
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
