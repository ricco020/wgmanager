import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { peerConfig, safeFileName } from "@/lib/wg";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const peer = await db.peer.findFirst({ where: { id, server: { userId: user.id } }, include: { server: true } });
  if (!peer) return new NextResponse("not found", { status: 404 });
  return new NextResponse(peerConfig(peer.server, peer), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(peer.name)}.conf"`,
      "Cache-Control": "no-store",
    },
  });
}
