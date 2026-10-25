import type { Metadata } from "next";
import { FREE_LIMITS, PRO_PRICE_EUR, SITE } from "@/lib/site";
import { recordHit } from "@/lib/stats";

// ?ref= variants of / (vpnsmith boxes) must fold into one URL.
export const metadata: Metadata = { alternates: { canonical: `${SITE}/` } };

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  await recordHit("/", ref);
  return (
    <>
      <section className="hero">
        <div>
          <div className="kicker fade">Hosted WireGuard configuration manager</div>
          <h1 className="fade d1">Every server, every peer, one dashboard.</h1>
          <p className="lead fade d2">
            Stop juggling wg0.conf files by hand: add your servers and devices once, then download each config or scan its QR code.
            Addresses are allocated for you and keys are stored encrypted.
          </p>
          <p className="fade d3">
            <a className="btn" href="/signup">Start free: {FREE_LIMITS.servers} server, {FREE_LIMITS.peers} peers</a>
            {" "}
            <a className="btn ghost" href="/pricing">Compare plans</a>
          </p>
          <p className="muted fade d3">No card for the free plan. Pro: unlimited servers and peers, {PRO_PRICE_EUR} EUR/month, cancel anytime.</p>
        </div>
        <div className="terminal fade d2">
          <div className="bar"><i /><i /><i /></div>
          <div><span className="c"># laptop.conf, downloaded from the dashboard</span></div>
          <div><span className="k">[Interface]</span></div>
          <div>PrivateKey = <span className="c">(stored encrypted, decrypted only when you download)</span></div>
          <div>Address = 10.8.0.2/24</div>
          <div>DNS = 1.1.1.1</div>
          <br />
          <div><span className="k">[Peer]</span></div>
          <div>PublicKey = <span className="c">server public key</span></div>
          <div>PresharedKey = <span className="c">per-peer PSK</span></div>
          <div>Endpoint = vpn.example.com:51820</div>
          <div>AllowedIPs = 0.0.0.0/0, ::/0</div>
          <div>PersistentKeepalive = 25</div>
        </div>
      </section>

      <section className="grid3">
        <div className="panel">
          <h3>No more IP collisions</h3>
          <p className="muted">Each server owns a subnet. New peers get the next free address automatically, and the server config is regenerated with every peer listed.</p>
        </div>
        <div className="panel">
          <h3>QR code for phones</h3>
          <p className="muted">Scan from the WireGuard app on iOS or Android. No file transfer, no typing keys on a phone keyboard.</p>
        </div>
        <div className="panel">
          <h3>Rotate, revoke, re-issue</h3>
          <p className="muted">Lost a laptop? Delete the peer, download the server config again, reload the interface. Done in under a minute.</p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 40 }}>
        <h2>How it works</h2>
        <ol>
          <li>Create a server: a name, its public hostname or IP, the UDP port (51820 by default) and a tunnel subnet.</li>
          <li>Add peers: laptop, phone, office router. Choose full tunnel or split tunnel per peer.</li>
          <li>Download <code>wg0.conf</code> for the server and one <code>.conf</code> (or QR code) per peer.</li>
          <li>On the server: <code>wg-quick up wg0</code>. On each device: import the file or scan the code.</li>
          <li>Already running WireGuard? Paste your existing <code>wg0.conf</code>: keys and peers are imported as they are, nothing changes on the devices. Not sure the file is clean? Run it through the free <a href="/check">config checker</a> first.</li>
        </ol>
        <p className="muted">
          Need a server first? WireGuard needs a machine with a public IP that stays on; a small Linux VPS is enough for a household
          or a small team. Contabo sells a VPS with WireGuard preinstalled:{" "}
          <a href="/out/vps?from=home" rel="sponsored nofollow">see the Contabo WireGuard VPS</a>{" "}
          (affiliate link: VPNSmith may earn a commission, the price is the same for you). To compare the usual options, the free
          {" "}<a href="https://www.vpnsmith.com/en/tools/self-hosted-vpn-cost-calculator" rel="noopener">self-hosted VPN cost calculator</a>
          {" "}on VPNSmith lists them.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 40 }}>
        <h2>What we store, and what we do not</h2>
        <p className="muted">
          Private keys and preshared keys are encrypted at rest with AES-256-GCM and only decrypted to render your config files.
          We never see your tunnel traffic: this service generates text files, it is not a VPN provider and nothing goes through our servers.
          You can delete a server or your account at any time, which erases all its keys.
        </p>
      </section>
    </>
  );
}
