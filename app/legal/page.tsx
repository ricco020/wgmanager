import type { Metadata } from "next";
import { EMAIL, LEGAL_HOST, LEGAL_PUBLISHER, PRODUCT } from "@/lib/site";

export const metadata: Metadata = { title: "Legal notice and privacy" };

export default function Legal() {
  return (
    <article style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1>Legal notice</h1>
      <h2>Publisher</h2>
      <p>{LEGAL_PUBLISHER.name}, {LEGAL_PUBLISHER.status}.</p>
      <p>Address: {LEGAL_PUBLISHER.address}<br />Phone: <a href={`tel:${LEGAL_PUBLISHER.phoneHref}`}>{LEGAL_PUBLISHER.phone}</a><br />Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      <p>SIRET: {LEGAL_PUBLISHER.siret} (SIREN {LEGAL_PUBLISHER.siren}). VAT not applicable, article 293 B of the French General Tax Code.</p>
      <p>Publication director: {LEGAL_PUBLISHER.name}.</p>
      <h2>Hosting</h2>
      <p>{LEGAL_HOST.name}, {LEGAL_HOST.address}. <a href={LEGAL_HOST.url} rel="noopener">{LEGAL_HOST.url}</a></p>
      <h2>Privacy</h2>
      <p>{PRODUCT} stores: your email address and a salted password hash (login), the servers and peers you create (names, endpoints, addresses, public keys), and private keys and preshared keys encrypted with AES-256-GCM. Payment data is handled by Stripe; we keep only your Stripe customer identifier and the end date of your subscription.</p>
      <p>Legal basis: performance of the contract (account, service) and legitimate interest (security logs kept 30 days). No advertising tracker, no sale of data. Data is hosted by {LEGAL_HOST.name}; Stripe Payments Europe, Ltd. processes payments.</p>
      <p>Your rights (access, rectification, erasure, portability, objection) can be exercised by email at {EMAIL}. Deleting a server erases its keys; to delete your account and all its data, send a request from the email of the account. You may lodge a complaint with the CNIL.</p>
      <p>Cookies: one session cookie (HttpOnly) to keep you logged in. No third-party cookie.</p>
      <h2>Trademark</h2>
      <p>WireGuard is a registered trademark of Jason A. Donenfeld. {PRODUCT} is an independent tool and is not affiliated with or endorsed by the WireGuard project.</p>
    </article>
  );
}
