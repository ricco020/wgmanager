import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { FREE_LIMITS, PRO_PRICE_EUR, SITE } from "@/lib/site";
import { isPro, stripeReady } from "@/lib/stripe";
import { recordHit } from "@/lib/stats";

export const metadata: Metadata = { title: "Pricing", alternates: { canonical: `${SITE}/pricing` } };
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
      <div className="panel" id="one-time" style={{ marginTop: 24 }}>
        <span className="tag">9 EUR, one time</span>
        <h3 style={{ margin: "10px 0 6px" }}>Only need the configuration files?</h3>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          WireGuard Pro for the free VPNSmith config generator: no account, no subscription. Up to 250 clients in one go and a single ZIP
          with every .conf file and its QR code. Keys are generated in your browser and never leave it.
        </p>
        <a className="btn ghost" href="https://www.vpnsmith.com/en/tools/wireguard-config-generator?ref=wgm-pricing#pro">See the generator</a>
      </div>
      <p className="muted">
        Both plans manage WireGuard servers you run yourself. No server yet? A small Linux VPS with a public IP is enough for a household
        or a small team. Affiliate link, VPNSmith may earn a commission and the price is the same for you:{" "}
        <a href="/out/vps?from=pricing" rel="sponsored nofollow">Contabo VPS with WireGuard preinstalled</a>.
      </p>
      <p className="muted">Payments are handled by Stripe. We never see your card number. Prices are in euros; your bank converts if your account is in another currency.</p>
    </>
  );
}
