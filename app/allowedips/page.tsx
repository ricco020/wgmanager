import type { Metadata } from "next";
import { recordHit } from "@/lib/stats";
import { FREE_LIMITS, PRO_PRICE_EUR, SITE } from "@/lib/site";
import { Calculator } from "./Calculator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WireGuard AllowedIPs calculator: exclude your LAN or an IP from the tunnel",
  description: "WireGuard has no exclude option. Enter what the tunnel should carry and what must stay out (LAN, a single IP, a country range): get the AllowedIPs line as the shortest list of CIDR blocks, IPv4 and IPv6. Runs in your browser.",
  alternates: { canonical: `${SITE}/allowedips` },
};

export default async function AllowedIpsPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  await recordHit("/allowedips", ref);
  return (
    <>
      <section style={{ padding: "48px 0 20px" }}>
        <div className="fade" style={{ color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, marginBottom: 14 }}>Free tool, no account</div>
        <h1 className="fade d1">WireGuard AllowedIPs calculator</h1>
        <p className="fade d2 muted" style={{ maxWidth: "62ch", fontSize: "1.05rem" }}>
          You want everything through the VPN except the printer, the NAS or one address, and WireGuard has no
          <code> ExcludedIPs</code> setting. The only way is to list every block you do want, which is tedious by hand.
          Enter what the tunnel should carry and what must stay out; the calculator returns the AllowedIPs line.
        </p>
      </section>

      <section className="fade d3" style={{ marginBottom: 40 }}>
        <Calculator />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Why AllowedIPs, and not an exclude list</h2>
        <p className="muted">
          In WireGuard, AllowedIPs does two jobs. On the way out, wg-quick and the mobile apps turn it into routes: an address
          listed there goes through the tunnel. On the way in, it is a filter: a packet from the peer is accepted only if its source
          address is in the list. Both work on whole CIDR blocks, so leaving out <code>192.168.1.0/24</code> from
          <code> 0.0.0.0/0</code> means writing the 24 blocks that cover the rest of the IPv4 space. That subtraction is what this
          page does, for IPv4 and IPv6, and it merges the result into the fewest blocks possible.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Before you paste the line</h2>
        <dl className="checks">
          <div><dt>Keep the VPN subnet in</dt><dd className="muted">Excluding 10.0.0.0/8 also removes a tunnel subnet such as 10.8.0.0/24, and the client can no longer reach the server&apos;s tunnel address. Put that subnet in the third field: it is added back.</dd></div>
          <div><dt>IPv6</dt><dd className="muted">If the allowed list has 0.0.0.0/0 but not ::/0, IPv6 traffic bypasses the tunnel on dual-stack networks. Keep ::/0 in the first field unless you mean it.</dd></div>
          <div><dt>Windows kill-switch</dt><dd className="muted">The Windows client offers &quot;Block untunneled traffic&quot; only when a peer routes 0.0.0.0/0 or ::/0 as a whole. A computed list does not, so that option goes away: decide which you need.</dd></div>
          <div><dt>Per-app split tunnel</dt><dd className="muted">The Android app can exclude applications from the tunnel in the tunnel&apos;s settings, which needs no AllowedIPs change. This calculator works by address, for every client.</dd></div>
          <div><dt>Client side only</dt><dd className="muted">Change AllowedIPs in the client&apos;s <code>[Peer]</code> section. On the server, each peer&apos;s AllowedIPs stays its own tunnel address (a /32).</dd></div>
        </dl>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Same rule for every device, without the copy and paste</h2>
        <p className="muted">
          In WireGuard Manager, a peer can be created as &quot;full tunnel, local network still reachable&quot;: the client file
          comes out with this list already computed, the server&apos;s tunnel subnet kept in, keys generated and a QR code for
          the phone. Free for {FREE_LIMITS.servers} server and {FREE_LIMITS.peers} peers, Pro at {PRO_PRICE_EUR} EUR/month for
          unlimited servers and peers. Already running a server? Paste its wg0.conf in the{" "}
          <a href="/check?ref=allowedips">config checker</a> first, then import it.
        </p>
        <p><a className="btn" href="/signup?ref=allowedips">Create a free account</a></p>
      </section>
    </>
  );
}
