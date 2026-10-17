import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serverConfig } from "@/lib/wg";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const server = await db.server.findFirst({ where: { id, userId: user.id }, include: { peers: { orderBy: { createdAt: "asc" } } } });
  if (!server) return new NextResponse("not found", { status: 404 });
  return new NextResponse(serverConfig(server, server.peers), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="wg0.conf"`,
      "Cache-Control": "no-store",
    },
  });
}
