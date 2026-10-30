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
        <div className="fade d1 tool-head">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="54" height="54" rx="12" fill="#141c24" stroke="#33414f" />
            <circle cx="13" cy="28" r="5" stroke="#ffb224" strokeWidth="2.5" />
            <circle cx="43" cy="28" r="5" stroke="#ffb224" strokeWidth="2.5" />
            <path d="M18 22h20M18 34h20" stroke="#aebbcb" strokeWidth="2" strokeLinecap="round" />
            <path d="M21 28h14" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 4" />
          </svg>
          <h1 className="h1tool" style={{ margin: 0 }}>WireGuard config checker</h1>
        </div>
        <p className="fade d2 muted" style={{ maxWidth: "58ch", fontSize: "1.05rem", margin: 0 }}>
          Paste a <code>wg0.conf</code> or a client file: every line wg-quick will refuse or misroute, with the fix.
        </p>
      </section>

      <section className="fade d3" style={{ marginBottom: 32 }}>
        <Checker signedIn={!!user} />
      </section>

      <div className="info2">
        <section className="panel">
          <h2>What it checks</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Symptoms it explains: handshake never completes, connected but no traffic, works on Wi-Fi but not on mobile data, sites that load halfway.
            On a server file it also adds a peer: next free IP, fresh keys, the server block, the client file and its QR code.
            Eight groups of rules, read from the wg-quick and wg(8) behaviour:
          </p>
          {CHECKS.map(([t, d]) => (
            <details key={t}><summary>{t}</summary><p className="muted">{d}</p></details>
          ))}
        </section>

        <section className="panel">
          <h2>Limits, local routes and privacy</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            The checker reads text, never your network.
          </p>
          <details>
            <summary>Full tunnel, but the printer and the NAS must stay local?</summary>
            <p className="muted">
              WireGuard has no exclude option: AllowedIPs has to list every block you want routed. The{" "}
              <a href="/allowedips?ref=check">AllowedIPs calculator</a> subtracts your LAN (or any address) from 0.0.0.0/0 and ::/0
              and gives you the line to paste.
            </p>
          </details>
          <details>
            <summary>What it cannot see</summary>
            <p className="muted">
              A file can be perfect and the tunnel still down. The checker does not know whether UDP port{" "}
              <code>51820</code> is open in your firewall or cloud security group, whether <code>net.ipv4.ip_forward</code> is on,
              or whether the client&apos;s PublicKey really matches the private key on the device. If the file passes, check those next,
              and run <code>wg show</code> on the server: a &quot;latest handshake&quot; line tells you the keys and the port are right.
            </p>
          </details>
          <details id="privacy" open>
            <summary>Privacy and telemetry</summary>
            <ul className="muted">
              <li><b>Stays in this page:</b> the whole file, private keys included. The check runs in this page&apos;s JavaScript.</li>
              <li><b>Counted:</b> that a check ran, with the file type and a rough peer count. No content, no IP address.</li>
              <li><b>Sent only if you import it into WireGuard Manager:</b> the file, over HTTPS, keys stored encrypted (AES-256-GCM).</li>
            </ul>
          </details>
        </section>
      </div>
    </>
  );
}
