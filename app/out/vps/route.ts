import { NextResponse } from "next/server";
import { recordHit } from "@/lib/stats";
import { contaboBfLive } from "@/lib/offers";

/** Outbound click to a VPS offer, counted before leaving (`/out:vps-<from>` or `/out:vps-<from>-hp`). Affiliate links held by
 *  VPNSmith (CJ): `p=hp` goes to HostPapa VPS (45 USD fixed per sale, first link since 29/10), `p=hg` to Hostinger VPS (HasOffers
 *  offer 815, 10 to 60 % CPA, accepted 18/11, src travels as aff_sub, counted `/out:vps-<from>-hg`), anything else to Contabo.
 *  The `src` travels to CJ as SID so a sale can be traced back to the WireGuard Manager screen that sent it. */
const FROM_RE = /^[a-z0-9-]{1,20}$/;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const raw = params.get("from") ?? "";
  const from = FROM_RE.test(raw) ? raw : "other";
  if (params.get("p") === "hp") {
    await recordHit(`/out:vps-${from}-hp`);
    return NextResponse.redirect(`https://www.vpnsmith.com/go/hostpapa-vps?src=wgm-${from}-hp`, 302);
  }
  if (params.get("p") === "cbf") {
    await recordHit(`/out:vps-${from}-cbf`);
    const slug = contaboBfLive() ? "contabo-bf" : "contabo-wireguard";
    return NextResponse.redirect(`https://www.vpnsmith.com/go/${slug}?src=wgm-${from}-cbf`, 302);
  }
  if (params.get("p") === "hg") {
    await recordHit(`/out:vps-${from}-hg`);
    return NextResponse.redirect(`https://www.vpnsmith.com/go/hostinger-vps?src=wgm-${from}-hg`, 302);
  }
  await recordHit(`/out:vps-${from}`);
  return NextResponse.redirect(`https://www.vpnsmith.com/go/contabo-wireguard?src=wgm-${from}`, 302);
}
