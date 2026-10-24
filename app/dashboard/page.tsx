import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREE_LIMITS } from "@/lib/site";
import { isPro } from "@/lib/stripe";
import { ServerForm } from "./ServerForm";
import { ImportForm } from "./ImportForm";
import { deleteServer } from "../actions";
import { recordHit } from "@/lib/stats";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const pro = await isPro(user);
  const { welcome } = await searchParams;
  const servers = await db.server.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { peers: true } } } });
  await recordHit(servers.length ? "/dashboard" : "/dashboard:empty");
  const canAdd = pro || servers.length < FREE_LIMITS.servers;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 40 }}>
        <h1>Servers</h1>
        <span className={pro ? "tag pro" : "tag"}>{pro ? "Pro" : `Free: ${FREE_LIMITS.servers} server, ${FREE_LIMITS.peers} peers`}</span>
      </div>
      {welcome === "pro" && <p className="ok">Pro is active. Limits are lifted on this account.</p>}
      {servers.length === 0 && <p className="muted">No server yet. Create the first one below: you need its public hostname or IP and the UDP port you will open.</p>}
      {servers.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Endpoint</th><th>Subnet</th><th>Peers</th><th></th></tr></thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id}>
                <td><a href={`/dashboard/servers/${s.id}`}>{s.name}</a></td>
                <td>{s.endpoint}:{s.port}</td>
                <td>{s.subnet}</td>
                <td>{s._count.peers}</td>
                <td>
                  <form action={deleteServer}><input type="hidden" name="id" value={s.id} /><button className="btn danger sm" type="submit">Delete</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="panel" style={{ marginTop: 30 }}>
        <h2>New server</h2>
        {canAdd ? <ServerForm /> : <p className="muted">The free plan includes {FREE_LIMITS.servers} server. <a href="/pricing">Upgrade to Pro</a> for unlimited servers.</p>}
      </div>
      <div className="panel" id="import" style={{ marginTop: 18 }}>
        <h2>Already running WireGuard? Import your wg0.conf</h2>
        {canAdd ? <ImportForm pro={pro} /> : <p className="muted">The free plan includes {FREE_LIMITS.servers} server. <a href="/pricing">Upgrade to Pro</a> to import more.</p>}
      </div>
      {!pro && <p className="muted" style={{ marginTop: 20 }}>Need more? <a href="/pricing">Pro: unlimited servers and peers for 9 EUR/month</a>.</p>}
      {user.stripeCustomerId && (
        <form action="/api/stripe/portal" method="post" style={{ marginTop: 20 }}>
          <button className="btn ghost sm" type="submit">Manage subscription (invoices, card, cancel)</button>
        </form>
      )}
    </>
  );
}
