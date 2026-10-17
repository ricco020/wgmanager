import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREE_LIMITS } from "@/lib/site";
import { isPro } from "@/lib/stripe";
import { peerConfig, peerHasConfig, serverAddress } from "@/lib/wg";
import { deletePeer, rotatePeer } from "../../../actions";
import { PeerForm } from "./PeerForm";

export const metadata: Metadata = { title: "Server" };
export const dynamic = "force-dynamic";

export default async function ServerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const { imported } = await searchParams;
  const server = await db.server.findFirst({ where: { id, userId: user.id }, include: { peers: { orderBy: { createdAt: "asc" } } } });
  if (!server) notFound();
  const pro = await isPro(user);
  const canAdd = pro || server.peers.length < FREE_LIMITS.peers;
  const qrs = await Promise.all(server.peers.map((p) => peerHasConfig(p) ? QRCode.toDataURL(peerConfig(server, p), { margin: 1, width: 220, errorCorrectionLevel: "M" }) : Promise.resolve("")));
  const exportable = server.peers.filter(peerHasConfig).length;
  return (
    <>
      <p style={{ marginTop: 30 }}><a href="/dashboard">All servers</a></p>
      <h1>{server.name}</h1>
      {imported && <p className="ok">Imported with {imported} peer{imported === "1" ? "" : "s"}. Keys are unchanged: the server and the devices keep working as before.</p>}
      <div className="panel" style={{ marginBottom: 24 }}>
        <table>
          <tbody>
            <tr><th>Endpoint</th><td>{server.endpoint}:{server.port} (UDP)</td></tr>
            <tr><th>Server address</th><td>{serverAddress(server.subnet)}</td></tr>
            <tr><th>Server public key</th><td><code>{server.publicKey}</code></td></tr>
            <tr><th>DNS for clients</th><td>{server.dns}</td></tr>
            {server.mtu && <tr><th>MTU</th><td>{server.mtu}</td></tr>}
          </tbody>
        </table>
        <p style={{ marginTop: 16 }}>
          <a className="btn" href={`/api/export/server/${server.id}`}>Download wg0.conf</a>
          {exportable > 0 && <a className="btn ghost" href={`/api/export/server/${server.id}/peers.zip`} style={{ marginLeft: 10 }}>All peer .conf (zip)</a>}
          <span className="muted" style={{ marginLeft: 12 }}>Re-download after every peer change, then <code>wg syncconf wg0 &lt;(wg-quick strip wg0)</code> or <code>wg-quick down wg0 &amp;&amp; wg-quick up wg0</code>.</span>
        </p>
        <details>
          <summary>Server setup in four commands (Debian, Ubuntu)</summary>
          <pre>{`apt install wireguard
# copy wg0.conf to /etc/wireguard/wg0.conf, chmod 600
sysctl -w net.ipv4.ip_forward=1   # and persist it in /etc/sysctl.conf
systemctl enable --now wg-quick@wg0
# open UDP ${server.port} in your firewall / cloud security group`}</pre>
        </details>
      </div>

      <h2>Peers ({server.peers.length})</h2>
      {server.peers.length === 0 && <p className="muted">No peer yet. Add one per device.</p>}
      {server.peers.map((p, i) => (
        <div className="panel" key={p.id} style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 18 }}>
          <div>
            <h3>{p.name} <span className="tag">{p.ip}</span> {peerHasConfig(p) ? <span className="tag">{p.allowedIps.startsWith("0.0.0.0") ? "full tunnel" : "split tunnel"}</span> : <span className="tag">imported</span>}</h3>
            <p className="muted" style={{ fontSize: 13 }}>Public key <code>{p.publicKey}</code></p>
            {!peerHasConfig(p) && <p className="muted" style={{ fontSize: 13 }}>Imported peer: its private key is on the device, not here. It keeps working as is. Rotate keys to issue a fresh .conf and QR code from this page (the old device config then stops working).</p>}
            <div className="peer-actions">
              {peerHasConfig(p) && <a className="btn sm" href={`/api/export/peer/${p.id}`}>Download .conf</a>}
              <form action={rotatePeer}><input type="hidden" name="id" value={p.id} /><button className="btn ghost sm" type="submit">Rotate keys</button></form>
              <form action={deletePeer}><input type="hidden" name="id" value={p.id} /><button className="btn danger sm" type="submit">Delete</button></form>
            </div>
          </div>
          <div className="qr">
            {qrs[i] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrs[i]} alt={`QR code of the WireGuard configuration for ${p.name}`} width={150} height={150} />
            )}
          </div>
        </div>
      ))}

      <div className="panel" style={{ marginTop: 24 }}>
        <h2>Add a peer</h2>
        {canAdd ? <PeerForm serverId={server.id} /> : <p className="muted">The free plan includes {FREE_LIMITS.peers} peers. <a href="/pricing">Upgrade to Pro</a> for unlimited peers.</p>}
      </div>
    </>
  );
}
