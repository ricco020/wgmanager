import type { Metadata } from "next";
import { EMAIL, FREE_LIMITS, LEGAL_PUBLISHER, PRODUCT, PRO_PRICE_EUR } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of sale and use" };

export default function Terms() {
  return (
    <article style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1>Terms of sale and use</h1>
      <p className="muted">Last updated 17 October 2026.</p>
      <h2>1. Service</h2>
      <p>{PRODUCT} is a web application that generates and stores WireGuard configuration files (server and peers). It does not carry network traffic and is not a VPN service. The service is provided by {LEGAL_PUBLISHER.name}, {LEGAL_PUBLISHER.status} (see the legal notice).</p>
      <h2>2. Plans and prices</h2>
      <p>Free plan: {FREE_LIMITS.servers} server and {FREE_LIMITS.peers} peers, no payment. Pro plan: unlimited servers and peers for {PRO_PRICE_EUR} EUR per month, VAT not applicable (article 293 B CGI). Prices are shown in euros before payment; the price displayed at checkout is the price charged.</p>
      <h2>3. Subscription, renewal, cancellation</h2>
      <p>The Pro subscription starts on payment and renews automatically every month until cancelled. You can cancel at any time from the Stripe customer portal link sent with each invoice or by emailing {EMAIL}; access remains open until the end of the paid period, and no further charge is made. Prices may change with 30 days notice by email; you may cancel before the new price applies.</p>
      <h2>4. Right of withdrawal</h2>
      <p>For consumers in the European Union: the service starts immediately upon payment at your express request, acknowledged on the Stripe checkout page. In application of article L221-28 13° of the French Consumer Code, the right of withdrawal cannot be exercised once the service has started. If you did not use the Pro features, email {EMAIL} within 14 days and we will refund the first month.</p>
      <h2>5. Your obligations</h2>
      <p>You are responsible for the servers you operate and for the use of the generated configurations. Keep your password private. Do not use the service to attack third parties or to break the law of the country where you or your servers are.</p>
      <h2>6. Availability and liability</h2>
      <p>The service is provided as is, with a target availability of 99 percent per month, without guarantee. Configuration files are generated from the settings you enter; check them before use in production. Our liability is limited to the amount you paid over the last 12 months. We may suspend an account used for abuse.</p>
      <h2>7. Data and termination</h2>
      <p>You can delete servers, peers and your account at any time; the related keys are erased. We may close the service with 60 days notice by email; downloads remain available during that period.</p>
      <h2>8. Law and disputes</h2>
      <p>French law applies. Consumers may use the mediation service for consumer disputes (list on economie.gouv.fr) or the European online dispute resolution platform. Otherwise, the courts of Grasse, France, have jurisdiction.</p>
    </article>
  );
}
