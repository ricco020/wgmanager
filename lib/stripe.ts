import type { User } from "@prisma/client";
import { db } from "./db";
import { SITE } from "./site";

const API = "https://api.stripe.com/v1";
export const PROJECT = "wgmanager";
const GRACE_S = 3 * 24 * 3600;

function headers(sk: string) {
  return { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" };
}

export function stripeReady(): boolean {
  const sk = process.env.STRIPE_SECRET_KEY;
  return !!sk && /^(sk|rk)_(live|test)_/.test(sk) && !!process.env.STRIPE_PRICE_PRO;
}

/** Creates a Checkout session for the Pro subscription. The user's email is pre-filled;
 *  metadata[projet] isolates this product from the other products on the same Stripe account. */
export async function createCheckout(user: User, next?: "import"): Promise<string | null> {
  const sk = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_PRO;
  if (!sk || !price) return null;
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    "metadata[projet]": PROJECT,
    "metadata[userId]": user.id,
    "subscription_data[metadata][projet]": PROJECT,
    "subscription_data[metadata][userId]": user.id,
    success_url: `${SITE}/api/billing/return?s={CHECKOUT_SESSION_ID}${next ? `&next=${next}` : ""}`,
    cancel_url: next === "import" ? `${SITE}/dashboard#import` : `${SITE}/pricing`,
    "consent_collection[terms_of_service]": "required",
    "custom_text[terms_of_service_acceptance][message]":
      `I agree to the [terms of sale](${SITE}/terms) and ask for the service to start now.`,
  };
  if (user.stripeCustomerId) params.customer = user.stripeCustomerId;
  else params.customer_email = user.email;
  const r = await fetch(`${API}/checkout/sessions`, { method: "POST", headers: headers(sk), body: new URLSearchParams(params) });
  if (!r.ok) { console.error("stripe checkout", r.status, await r.text()); return null; }
  const s = (await r.json()) as { url?: string };
  return s.url ?? null;
}

/** Billing portal configuration created for this product (headline, terms, cancel at period end). */
const PORTAL_CONFIG = "bpc_1URVXfIjutMXe9x88HgOpA97";

/** Opens the Stripe customer portal: invoices, card update, cancellation in one click. */
export async function createPortal(user: User): Promise<string | null> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk || !user.stripeCustomerId) return null;
  const params: Record<string, string> = { customer: user.stripeCustomerId, return_url: `${SITE}/dashboard`, configuration: PORTAL_CONFIG };
  const r = await fetch(`${API}/billing_portal/sessions`, { method: "POST", headers: headers(sk), body: new URLSearchParams(params) });
  if (!r.ok) { console.error("stripe portal", r.status, await r.text()); return null; }
  const s = (await r.json()) as { url?: string };
  return s.url ?? null;
}

/** Looks up a completed session (id comes from the URL, so Stripe is the judge, not the URL). */
export async function customerFromSession(sessionId: string): Promise<{ customer: string; userId: string } | null> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) return null;
  const r = await fetch(`${API}/checkout/sessions/${sessionId}`, { headers: headers(sk), cache: "no-store" });
  if (!r.ok) return null;
  const s = (await r.json()) as { status?: string; customer?: string; metadata?: Record<string, string> };
  if (s.metadata?.projet !== PROJECT || s.status !== "complete" || !s.customer || !s.metadata?.userId) return null;
  return { customer: s.customer, userId: s.metadata.userId };
}

/** Asks Stripe for the live subscription of this customer. Returns period end (s) or null. */
export async function activePeriodEnd(customer: string): Promise<number | null> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return null;
  const r = await fetch(`${API}/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=10`,
    { headers: headers(sk), cache: "no-store" });
  if (!r.ok) return null;
  const d = (await r.json()) as { data?: { status: string; metadata?: Record<string, string>; current_period_end?: number; items?: { data?: { current_period_end?: number }[] } }[] };
  let best: number | null = null;
  for (const s of d.data ?? []) {
    if (s.metadata?.projet !== PROJECT) continue;
    if (s.status !== "active" && s.status !== "trialing") continue;
    const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400;
    if (!best || end > best) best = end;
  }
  return best;
}

/** Refreshes user.proUntil from Stripe and returns the updated user. */
export async function refreshPro(user: User): Promise<User> {
  if (!user.stripeCustomerId) return user;
  const end = await activePeriodEnd(user.stripeCustomerId);
  const proUntil = end ? new Date((end + GRACE_S) * 1000) : null;
  return db.user.update({ where: { id: user.id }, data: { proUntil } });
}

/** Pro if proUntil is in the future. When it has lapsed but a customer exists, re-ask Stripe once. */
export async function isPro(user: User): Promise<boolean> {
  const now = Date.now();
  if (user.proUntil && user.proUntil.getTime() > now) return true;
  if (!user.stripeCustomerId) return false;
  const u = await refreshPro(user);
  return !!u.proUntil && u.proUntil.getTime() > now;
}
