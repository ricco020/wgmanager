import { NextResponse } from "next/server";
import { recordHit } from "@/lib/stats";

/** Outbound click to a VPN offer, counted before leaving (`/out:vpn-<from>`). Affiliate link held by VPNSmith (Proton VPN),
 *  the `src` travels to the network as aff_sub2 so a sale can be traced back to the WireGuard Manager screen that sent it. */
const FROM_RE = /^[a-z0-9-]{1,20}$/;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("from") ?? "";
  const from = FROM_RE.test(raw) ? raw : "other";
  await recordHit(`/out:vpn-${from}`);
  return NextResponse.redirect(`https://www.vpnsmith.com/go/proton-vpn?src=wgm-${from}`, 302);
}
