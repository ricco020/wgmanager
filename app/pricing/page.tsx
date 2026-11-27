import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { FREE_LIMITS, PRO_FOR_SALE, PRO_PRICE_EUR, SITE, TRIAL_DAYS } from "@/lib/site";
import { isPro, stripeReady } from "@/lib/stripe";
import { recordHit } from "@/lib/stats";
import { ContaboBfLine } from "@/lib/offers";

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
      <p className="muted">Every new account has Pro limits lifted for {TRIAL_DAYS} days, no card asked: import a server of any size. After that, what you added stays with its files, and adding more than the free limits needs Pro. Cancel any time from your dashboard.</p>
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
          ) : !PRO_FOR_SALE ? (
            <span className="muted">Pro is closed to new subscriptions. Current subscribers keep it and manage it from the dashboard.</span>
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
      <div id="one-time" style={{ marginTop: 48, padding: 22, border: "1px dashed var(--line)", borderRadius: 10 }}>
        <h3 style={{ margin: "0 0 4px" }}>Only need configuration files?</h3>
        <div className="price" style={{ fontSize: 22 }}>0 EUR <small>no account, no subscription</small></div>
        <p className="muted" style={{ margin: "8px 0 14px" }}>
          The VPNSmith WireGuard config generator is free: up to 250 clients in one go, a QR code per client and a single ZIP
          with every .conf file and its QR code as PNG. Keys are generated in your browser and never leave it.
        </p>
        <a className="btn ghost sm" href="https://www.vpnsmith.com/en/tools/wireguard-config-generator?ref=wgm-pricing">Open the VPNSmith generator</a>
      </div>
      <p className="muted">
        Both plans manage WireGuard servers you run yourself. No server yet? A small Linux VPS with a public IP is enough for a household
        or a small team. Affiliate links, VPNSmith may earn a commission and the price is the same for you:{" "}
        <a href="/out/vps?from=pricing" rel="sponsored nofollow">Contabo Cloud VPS 4 with WireGuard preinstalled</a> (listed from 4.40 EUR a month on a 24-month term on 17 November 2026),{" "}
        <a href="/out/vps?from=pricing&p=hp" rel="sponsored nofollow">HostPapa VPS Lite, 2.95 USD/month on 3 years</a>,{" "}
        <a href="/out/vps?from=pricing&p=hg" rel="sponsored nofollow">Hostinger KVM 1</a> if the same machine also runs Docker
        (4 GB RAM, 6.49 USD/month paid for 24 months on 18 November 2026, renewing at 11.99). <ContaboBfLine from="pricing" />
      </p>
      <p className="muted">Payments are handled by Stripe. We never see your card number. Prices are in euros; your bank converts if your account is in another currency.</p>
    </>
  );
}
