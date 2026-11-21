import type { Metadata } from "next";
import { recordHit } from "@/lib/stats";
import { JsonLd, toolLd } from "@/lib/jsonld";
import { FREE_LIMITS, SITE } from "@/lib/site";
import { KeyGen } from "./KeyGen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WireGuard key generator: private, public and preshared key in your browser",
  description: "Generate a WireGuard key pair and a preshared key (PSK) in your browser, or paste a PrivateKey to get the public key the other side must list. Same format as wg genkey, wg pubkey and wg genpsk. Nothing is sent.",
  alternates: { canonical: `${SITE}/keys` },
};

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  await recordHit("/keys", ref);
  return (
    <>
      <JsonLd data={toolLd("/keys", "WireGuard key generator", metadata.description as string, ["X25519 key pair in the browser", "Preshared key (wg genpsk format)", "Public key from an existing private key"])} />
      <section style={{ padding: "48px 0 20px" }}>
        <div className="fade" style={{ color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, marginBottom: 14 }}>Free tool, no account</div>
        <h1 className="fade d1">WireGuard key generator</h1>
        <p className="fade d2 muted" style={{ maxWidth: "62ch", fontSize: "1.05rem" }}>
          A private key, its public key and a preshared key, made by your browser&apos;s own crypto (WebCrypto X25519) and never sent
          anywhere. Already have a PrivateKey? The second box tells you which public key the other side must list.
        </p>
      </section>

      <section className="fade d3" style={{ marginBottom: 40 }}>
        <KeyGen />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Prefer your own machine? The same three commands</h2>
        <p className="muted">On the server, keys made locally never leave it. These give exactly the same format as this page: 32 bytes, base64, 44 characters.</p>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{`umask 077
wg genkey | tee privatekey | wg pubkey > publickey
wg genpsk > presharedkey`}</pre>
        <p className="muted">On Windows, the WireGuard app writes a new PrivateKey when you click &quot;Add empty tunnel&quot; and shows its public key above the editor.</p>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Where each key goes</h2>
        <dl className="checks">
          <div><dt>PrivateKey</dt><dd className="muted">In the <code>[Interface]</code> of the device it belongs to, and nowhere else. One per device: two clients sharing a key keep knocking each other off the tunnel.</dd></div>
          <div><dt>PublicKey</dt><dd className="muted">In the <code>[Peer]</code> section of the other side. The server lists each client&apos;s public key, each client lists the server&apos;s.</dd></div>
          <div><dt>PresharedKey</dt><dd className="muted">Optional, one per pair: the identical value in the server&apos;s <code>[Peer]</code> for that client and in the client&apos;s <code>[Peer]</code> for the server. It adds a symmetric layer on top of X25519 (WireGuard&apos;s answer to future quantum attacks). If only one side has it, or the values differ, the handshake fails without an error message.</dd></div>
        </dl>
      </section>

      <aside aria-label="Partner offer" style={{ margin: "0 0 24px", padding: 20, background: "#111820", border: "1px solid #33404D", borderRadius: 10 }}>
        <p style={{ margin: 0, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <strong>No server yet for these keys?</strong> <span className="tag">Affiliate link</span>
        </p>
        <p className="muted" style={{ margin: "10px 0 12px", fontSize: 14 }}>
          A WireGuard server needs a VPS with a public IPv4 and one open UDP port. Hostinger&apos;s KVM 1 plan has both; check the
          current price on its page before ordering.
        </p>
        <p style={{ margin: 0, fontSize: 14 }}>
          <a className="btn sm" href="/out/vps?from=keys&p=hg" rel="sponsored nofollow">See Hostinger KVM 1</a>
        </p>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>VPNSmith may earn a commission; the price is the same for you.</p>
      </aside>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Keys made, handshake still not coming?</h2>
        <p className="muted">
          Paste the server and client files in the <a href="/check?ref=keys#pair">pair checker</a>: it derives both public keys
          and shows which side lists the wrong one, a missing PresharedKey or a port that does not match. To skip the copy and paste
          for good, WireGuard Manager generates keys, PSK and QR codes for every peer (free for {FREE_LIMITS.servers} server and{" "}
          {FREE_LIMITS.peers} peers).
        </p>
        <p><a className="btn" href="/signup?ref=keys">Create a free account</a></p>
      </section>
    </>
  );
}
