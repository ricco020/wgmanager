import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerFromSession, refreshPro } from "@/lib/stripe";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Stripe sends the browser back here. The session id is only a lookup key: Stripe decides. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get("s") ?? "";
  const found = await customerFromSession(s);
  if (found) {
    const user = await db.user.findUnique({ where: { id: found.userId } });
    if (user) {
      const u = await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: found.customer } });
      await refreshPro(u);
      return NextResponse.redirect(`${SITE}/dashboard?welcome=pro`, 303);
    }
  }
  return NextResponse.redirect(`${SITE}/pricing?error=1`, 303);
}
