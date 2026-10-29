import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { recordHit } from "@/lib/stats";
import { JsonLd, toolLd } from "@/lib/jsonld";
import { SITE } from "@/lib/site";
import { Checker } from "./Checker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WireGuard config checker: validate a wg0.conf, add a peer",
  description: "Paste a WireGuard config and find what breaks it: truncated keys, overlapping AllowedIPs, missing Endpoint, MTU above 1420, IPv6 and DNS leaks in full tunnel. Then add a peer: next free IP, keys, client .conf and QR code. Runs in your browser, keys are never uploaded.",
  alternates: { canonical: `${SITE}/check` },
};

const CHECKS: Array<[string, string]> = [
  ["Keys", "Each PrivateKey, PublicKey and PresharedKey must be 44 base64 characters that decode to 32 bytes. A key cut by a terminal or a chat app fails here, and so does a private key pasted where the other side's public key goes."],
  ["Unknown keys and sections", "wg-quick refuses the whole file on a single typo (\"AllowdIPs\", \"[Peers]\") or a key in the wrong section, such as Endpoint under [Interface]."],
  ["Overlapping AllowedIPs", "On a server, two peers whose AllowedIPs overlap fight over the same addresses: wg hands the range to the last peer loaded, the other one keeps its handshake but receives nothing. 10.8.0.2/24 instead of 10.8.0.2/32 is the usual cause."],
  ["Duplicate peers", "The same PublicKey listed twice keeps only one entry, so one device can never connect."],
  ["Endpoint", "A client needs Endpoint = host:port to start the handshake. An Endpoint on a private address (192.168.x.x, 10.x.x.x) only works from inside that network."],
  ["MTU", "Above 1420 on a standard 1500 link, packets fragment once WireGuard adds its headers: sites load halfway, SSH stalls after login. Below 1280, IPv6 breaks."],
  ["Leaks in full tunnel", "0.0.0.0/0 without ::/0 lets IPv6 traffic bypass the tunnel. A full tunnel without a DNS line keeps sending lookups to the local resolver."],
  ["Server hygiene", "Missing ListenPort (random port at each start), DNS on the server (it rewrites the server's own resolver), SaveConfig = true (hand edits overwritten), the NAT interface name in PostUp."],
];

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  await recordHit("/check", ref);
  const user = await currentUser();
  return (
    <>
      <JsonLd data={toolLd("/check", "WireGuard config checker", metadata.description as string, CHECKS.map(([k]) => k).concat(["Add a peer: next free IP, keys, client .conf and QR code"]))} />
      <section style={{ padding: "28px 0 16px" }}>
        <div className="fade" style={{ color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, marginBottom: 10 }}>Free tool, no account</div>
        <h1 className="fade d1 h1tool">WireGuard config checker</h1>
        <p className="fade d2 muted" style={{ maxWidth: "58ch", fontSize: "1.05rem", margin: 0 }}>
          Paste a <code>wg0.conf</code> or a client file: every line wg-quick will refuse or misroute, with the fix.
        </p>
      </section>

      <section className="fade d3" style={{ marginBottom: 32 }}>
        <Checker signedIn={!!user} />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Symptoms it explains</h2>
        <p className="muted" style={{ margin: 0 }}>
          Handshake never completes, connected but no traffic, works on Wi-Fi but not on mobile data, sites that load halfway.
          On a server file, the same page adds a peer: next free IP, fresh keys, the block for the server, the client file and its QR code.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>What it checks</h2>
        <p className="muted" style={{ fontSize: 14 }}>Eight groups of rules, read from the wg-quick and wg(8) behaviour. Open one for the detail.</p>
        <div className="checklist">
          {CHECKS.map(([t, d]) => (
            <details key={t}><summary>{t}</summary><p className="muted">{d}</p></details>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Full tunnel, but the printer and the NAS must stay local?</h2>
        <p className="muted">
          WireGuard has no exclude option: AllowedIPs has to list every block you want routed. The{" "}
          <a href="/allowedips?ref=check">AllowedIPs calculator</a> subtracts your LAN (or any address) from 0.0.0.0/0 and ::/0
          and gives you the line to paste.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>What it cannot see</h2>
        <p className="muted">
          A file can be perfect and the tunnel still down. The checker reads text; it does not know whether UDP port{" "}
          <code>51820</code> is open in your firewall or cloud security group, whether <code>net.ipv4.ip_forward</code> is on,
          or whether the client&apos;s PublicKey really matches the private key on the device. If the file passes, check those next,
          and run <code>wg show</code> on the server: a &quot;latest handshake&quot; line tells you the keys and the port are right.
        </p>
      </section>

      <section id="privacy" className="panel" style={{ marginBottom: 24 }}>
        <h2>Privacy</h2>
        <p className="muted">
          The check runs entirely in this page&apos;s JavaScript. The config, private keys included, is not sent anywhere; we only
          count that a check was run. If you choose to import the file into WireGuard Manager afterwards, it is sent then, over
          HTTPS, and the keys are stored encrypted (AES-256-GCM).
        </p>
      </section>
    </>
  );
}
