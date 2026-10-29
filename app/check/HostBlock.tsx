/** "Where to run this server" box shown at the result of the checker (direction 29/10: hosting offer at the point of action,
 *  HostPapa first, Contabo second). Offer read on 28/10 on hostpapa.com: Unmanaged VPS Lite, 1 core, 1 GB, 25 GB NVMe,
 *  2.95 USD/month on the 3-year term, then the regular price; 30-day money-back. Clicks counted as /out:vps-<from>[-hp]. */
export function HostBlock({ from, title, lead }: { from: string; title: string; lead: string }) {
  return (
    <div className="handoff">
      <h3>{title}</h3>
      <p className="muted">{lead}</p>
      <p className="muted" style={{ fontSize: 14 }}>
        Smallest server that runs it: HostPapa Unmanaged VPS Lite, 1 core, 1 GB RAM, 25 GB NVMe, root SSH, a public IPv4,
        30-day money-back. On 28 October 2026 it cost 2.95 USD/month on the 3-year term, then the regular price; the order page
        shows the current price.
      </p>
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "10px 0 6px" }}>
        <a className="btn" href={`/out/vps?from=${from}&p=hp`} rel="sponsored nofollow">See HostPapa VPS Lite</a>
        <a href={`/out/vps?from=${from}`} rel="sponsored nofollow">or a Contabo VPS with WireGuard preinstalled</a>
      </p>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Affiliate links: VPNSmith may earn a commission, the price is the same for you.</p>
    </div>
  );
}
