/** "Where to run this server" box shown at the result of the checker (direction 29/10: hosting offer at the point of action,
 *  HostPapa first, Contabo second). Offer read on 28/10 on hostpapa.com: Unmanaged VPS Lite, 1 core, 1 GB, 25 GB NVMe,
 *  2.95 USD/month on the 3-year term, then the regular price; 30-day money-back. Hostinger KVM 1 read on 18/11 (vpnsmith hostinger-vps-black-friday-2026). Clicks counted as /out:vps-<from>[-hp|-hg]. */
export function HostBlock({ from, title, lead }: { from: string; title: string; lead: string }) {
  return (
    <div className="handoff">
      <h3>{title}</h3>
      <p className="muted">{lead}</p>
      <p className="muted" style={{ fontSize: 14 }}>
        Smallest server that runs it: HostPapa Unmanaged VPS Lite, 1 core, 1 GB RAM, 25 GB NVMe, root SSH, a public IPv4,
        30-day money-back. On 17 November 2026 it cost 2.95 USD/month on the 3-year term, then the regular price. Their Black Friday
        sale was running that day: the next plan up, Start (2 cores, 2 GB RAM, 50 GB NVMe), was 4.45 USD/month on the same term.
        The order page shows the current price.
      </p>
      <p className="muted" style={{ fontSize: 14 }}>
        Need more memory for Docker or a second service next to WireGuard? Hostinger KVM 1 has 1 vCPU, 4 GB RAM, 50 GB NVMe and 4 TB
        of traffic. On 18 November 2026 it cost 6.49 USD/month paid upfront for 24 months (155.76 USD), renewing at 11.99 USD/month.
      </p>
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "10px 0 6px" }}>
        <a className="btn" href={`/out/vps?from=${from}&p=hp`} rel="sponsored nofollow">See HostPapa VPS Lite</a>
        <a href={`/out/vps?from=${from}&p=hg`} rel="sponsored nofollow">Hostinger KVM 1, 4 GB RAM</a>
        <a href={`/out/vps?from=${from}`} rel="sponsored nofollow">or a Contabo VPS with WireGuard preinstalled</a>
      </p>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Affiliate links: VPNSmith may earn a commission, the price is the same for you.</p>
    </div>
  );
}
