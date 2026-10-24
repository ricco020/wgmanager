import type { Metadata } from "next";
import { recordHit } from "@/lib/stats";
import { FREE_LIMITS, PRO_PRICE_EUR, SITE } from "@/lib/site";
import { QrTool } from "./QrTool";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WireGuard QR code generator: turn a .conf into a QR for the mobile app",
  description: "Paste or open a WireGuard client .conf and get the QR code the Android and iOS apps scan, with a check of the keys and fields the app rejects. Runs in your browser: the private key is never uploaded.",
  alternates: { canonical: `${SITE}/qr` },
};

export default async function QrPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  await recordHit("/qr", ref);
  return (
    <>
      <section style={{ padding: "36px 0 16px" }}>
        <div className="fade" style={{ color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, marginBottom: 14 }}>Free tool, no account</div>
        <h1 className="fade d1">WireGuard config to QR code</h1>
        <p className="fade d2 muted" style={{ maxWidth: "62ch", fontSize: "1.05rem" }}>
          Paste a client <code>.conf</code> and scan the result with the WireGuard app on Android or iOS.
        </p>
      </section>

      <section className="fade d3" style={{ marginBottom: 40 }}>
        <QrTool />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>On the server, without a browser</h2>
        <p className="muted">
          If you are already in an SSH session on the server, <code>qrencode</code> prints the same code in the terminal:
        </p>
        <pre style={{ fontSize: 13 }}>{"sudo apt install qrencode\nqrencode -t ansiutf8 < client.conf"}</pre>
        <p className="muted">
          Use a terminal with a dark background and a font small enough for the whole code to fit, otherwise the phone will not read it.
          <code> -t png -o client.png</code> writes an image instead.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Why the app says the QR code is invalid</h2>
        <dl className="checks">
          <div><dt>A server file was encoded</dt><dd className="muted">The phone needs the client side: its own PrivateKey and Address in [Interface], and the server&apos;s PublicKey and Endpoint in [Peer]. A wg0.conf with several [Peer] sections is the server file.</dd></div>
          <div><dt>A key was cut or edited</dt><dd className="muted">Every key is 44 characters ending in &quot;=&quot;. A missing character or a line break inside a key makes the app reject the whole file.</dd></div>
          <div><dt>An unknown field</dt><dd className="muted">A typo in a field name (AllowedIP, Keepalive) or a field from another tool stops the import. The tool above lists these before you scan.</dd></div>
          <div><dt>The code is too dense to read</dt><dd className="muted">Long PostUp lines and comments add data. Remove comments and lines the client does not need before you encode it.</dd></div>
        </dl>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>A QR code for every device, kept in one place</h2>
        <p className="muted">
          WireGuard Manager keeps the server and its peers: adding a phone gives you the next free address, new keys and its QR code
          in one step, and a lost device is revoked by rotating its keys. Free for {FREE_LIMITS.servers} server and {FREE_LIMITS.peers} peers,
          Pro at {PRO_PRICE_EUR} EUR/month for unlimited servers and peers. Already running a server? Its wg0.conf can be imported as it is.
        </p>
        <p><a className="btn" href="/signup?ref=qr">Create a free account</a></p>
      </section>
    </>
  );
}
