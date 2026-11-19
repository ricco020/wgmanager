import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREE_LIMITS } from "@/lib/site";
import { isPro, inTrial, trialEnd } from "@/lib/stripe";
import { ServerForm } from "./ServerForm";
import { ImportForm } from "./ImportForm";
import { createSample, deleteServer } from "../actions";
import { recordHit } from "@/lib/stats";
import { makeSample } from "@/lib/sample";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; sample?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const pro = await isPro(user);
  const trial = !pro && inTrial(user);
  const trialUntil = trialEnd(user).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const { welcome, sample } = await searchParams;
  const servers = await db.server.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { peers: true } } } });
  // Right after signup (19/11, ndd-saas-2): 13 of 21 accounts never created anything, so a new account lands on a
  // sample server with its QR codes instead of an empty form. Only once: with any server, sample=1 is ignored.
  if (sample === "1" && servers.length === 0) {
    const id = await makeSample(user.id);
    await recordHit("/dashboard:sample-auto");
    redirect(`/dashboard/servers/${id}?first=1`);
  }
  await recordHit(servers.length ? "/dashboard" : "/dashboard:empty");
  const canAdd = pro || trial || servers.filter((s) => s.endpoint !== "vpn.example.com").length < FREE_LIMITS.servers;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 40 }}>
        <h1>Servers</h1>
        <span className={pro ? "tag pro" : "tag"}>{pro ? "Pro" : trial ? `Pro trial until ${trialUntil}` : `Free: ${FREE_LIMITS.servers} server, ${FREE_LIMITS.peers} peers`}</span>
      </div>
      {welcome === "pro" && <p className="ok">Pro is active. Limits are lifted on this account.</p>}
      {servers.length === 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h2>Start here: which case are you in?</h2>
          <form action={createSample} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "4px 0 16px" }}>
            <button className="btn" type="submit">Just looking? Open a sample server</button>
            <span className="muted" style={{ fontSize: 14 }}>One click, nothing to type: a server with two devices, their .conf files and QR codes. Delete it when you add your own.</span>
          </form>
          <ol className="stack" style={{ paddingLeft: 20 }}>
            <li>
              <strong>WireGuard already runs on a server.</strong> <a href="#import">Paste its wg0.conf below</a>: keys and peer IPs stay as
              they are, and you can add the next device from here.
            </li>
            <li>
              <strong>You have a server (VPS, Raspberry Pi, home box) but no WireGuard yet.</strong> <a href="#new">Create it below</a> with its
              public hostname or IP; the next page gives the wg0.conf and the four commands that install it.
            </li>
            <li>
              <strong>No server yet.</strong> WireGuard needs a machine with a public IP that stays on. A small Linux VPS is enough for a
              household or a small team: WireGuard runs in the kernel and a single vCPU is usually
              enough for that traffic. Smallest that runs it: HostPapa VPS Lite (1 core, 1 GB RAM, 25 GB NVMe, 2.95 USD/month on the
              3-year term on 17 November 2026).{" "}
              <a className="btn sm" href="/out/vps?from=empty&p=hp" rel="sponsored nofollow">See HostPapa VPS Lite</a>{" "}
              If the same machine also runs Docker (Pi-hole, a reverse proxy):{" "}
              <a href="/out/vps?from=empty&p=hg" rel="sponsored nofollow">Hostinger KVM 1</a>, 4 GB RAM, 6.49 USD/month paid for 24 months
              on 18 November 2026, renewing at 11.99.{" "}
              <a href="/out/vps?from=empty" rel="sponsored nofollow">Or Contabo with WireGuard preinstalled</a>.{" "}
              <span className="muted">(affiliate links: VPNSmith may earn a commission, the price is the same for you). Then come back and
              create the server here with its IP.</span>
            </li>
          </ol>
        </div>
      )}
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
      <div className="panel" id="new" style={{ marginTop: 30 }}>
        <h2>New server</h2>
        {canAdd ? <ServerForm /> : <p className="muted">The free plan includes {FREE_LIMITS.servers} server. <a href="/pricing">Upgrade to Pro</a> for unlimited servers.</p>}
      </div>
      <div className="panel" id="import" style={{ marginTop: 18 }}>
        <h2>Already running WireGuard? Import your wg0.conf or wg-easy wg0.json</h2>
        {canAdd ? <ImportForm pro={pro || trial} /> : <p className="muted">The free plan includes {FREE_LIMITS.servers} server. <a href="/pricing">Upgrade to Pro</a> to import more.</p>}
      </div>
      {trial && <p className="muted" style={{ marginTop: 20 }}>Pro trial until {trialUntil}: unlimited servers and peers, no card asked. After that date everything you added stays here with its files; adding more than {FREE_LIMITS.servers} server or {FREE_LIMITS.peers} peers needs <a href="/pricing">Pro, 9 EUR/month</a>.</p>}
      {!pro && !trial && <p className="muted" style={{ marginTop: 20 }}>Need more? <a href="/pricing">Pro: unlimited servers and peers for 9 EUR/month</a>.</p>}
      {user.stripeCustomerId && (
        <form action="/api/stripe/portal" method="post" style={{ marginTop: 20 }}>
          <button className="btn ghost sm" type="submit">Manage subscription (invoices, card, cancel)</button>
        </form>
      )}
    </>
  );
}
