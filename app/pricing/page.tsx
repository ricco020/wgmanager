import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { FREE_LIMITS, PRO_PRICE_EUR } from "@/lib/site";
import { isPro, stripeReady } from "@/lib/stripe";
import { recordHit } from "@/lib/stats";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  const pro = user ? await isPro(user) : false;
  const { error } = await searchParams;
  await recordHit("/pricing");
  const ready = stripeReady();
  return (
    <>
      <h1 style={{ marginTop: 50 }}>Simple pricing</h1>
      <p className="muted">Start free. Upgrade when you manage more than one server or a handful of devices. Cancel any time from your dashboard.</p>
      {error && <p className="err">The payment could not be confirmed. Nothing was charged if you did not complete the Stripe page.</p>}
      <div className="pricing">
        <div className="panel">
          <span className="tag">Free</span>
          <div className="price">0 <small>EUR</small></div>
          <ul className="check">
            <li>{FREE_LIMITS.servers} server</li>
            <li>{FREE_LIMITS.peers} peers</li>
            <li>Server and peer .conf downloads</li>
            <li>QR codes</li>
            <li>Encrypted key storage</li>
          </ul>
          {user ? <a className="btn ghost" href="/dashboard">Open dashboard</a> : <a className="btn ghost" href="/signup">Create a free account</a>}
        </div>
        <div className="panel pro">
          <span className="tag pro">Pro</span>
          <div className="price">{PRO_PRICE_EUR} <small>EUR / month, VAT not applicable</small></div>
          <ul className="check">
            <li>Unlimited servers</li>
            <li>Unlimited peers</li>
            <li>Everything in Free</li>
            <li>Priority fixes by email</li>
            <li>Cancel any time, no commitment</li>
          </ul>
          {pro ? (
            <span className="ok">You are on Pro. Thank you.</span>
          ) : user ? (
            ready ? (
              <form action="/api/stripe/checkout" method="post"><button className="btn" type="submit">Upgrade to Pro</button></form>
            ) : (
              <span className="muted">Payments are being set up. Email us if you want Pro today.</span>
            )
          ) : (
            <a className="btn" href="/signup?next=pro">Start free, then upgrade</a>
          )}
        </div>
      </div>
      <p className="muted">Payments are handled by Stripe. We never see your card number. Prices are in euros; your bank converts if your account is in another currency.</p>
    </>
  );
}
