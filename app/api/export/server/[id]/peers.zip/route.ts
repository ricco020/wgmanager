import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { peerConfig, peerHasConfig, safeFileName } from "@/lib/wg";
import { zipStore } from "@/lib/zip";

export const dynamic = "force-dynamic";

/** One .conf per peer in a single zip (imported peers without a private key are skipped). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const server = await db.server.findFirst({ where: { id, userId: user.id }, include: { peers: { orderBy: { createdAt: "asc" } } } });
  if (!server) return new NextResponse("not found", { status: 404 });
  const used = new Set<string>();
  const files = server.peers.filter(peerHasConfig).map((p) => {
    let base = safeFileName(p.name);
    let name = `${base}.conf`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}.conf`;
    used.add(name);
    return { name, data: peerConfig(server, p) };
  });
  if (files.length === 0) return new NextResponse("no exportable peer", { status: 404 });
  return new NextResponse(new Uint8Array(zipStore(files)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFileName(server.name)}-peers.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
