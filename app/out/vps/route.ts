import { NextResponse } from "next/server";
import { recordHit } from "@/lib/stats";

/** Outbound click to a VPS offer, counted before leaving (`/out:vps-<from>`). Affiliate link held by VPNSmith (Contabo, CJ),
 *  the `src` travels to CJ as SID so a sale can be traced back to the WireGuard Manager screen that sent it. */
const FROM_RE = /^[a-z0-9-]{1,20}$/;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("from") ?? "";
  const from = FROM_RE.test(raw) ? raw : "other";
  await recordHit(`/out:vps-${from}`);
  return NextResponse.redirect(`https://www.vpnsmith.com/go/contabo-wireguard?src=wgm-${from}`, 302);
}
