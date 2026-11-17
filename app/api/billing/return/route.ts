import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerFromSession, grantPaidMonth, refreshPro } from "@/lib/stripe";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Stripe sends the browser back here. The session id is only a lookup key: Stripe decides. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const s = q.get("s") ?? "";
  const after = q.get("next") === "import" ? "#import" : "";
  const found = await customerFromSession(s);
  if (found) {
    const user = await db.user.findUnique({ where: { id: found.userId } });
    if (user) {
      const u = await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: found.customer } });
      // The session is complete and paid (checked with Stripe): Pro opens now, then Stripe refines the date
      // when the key can read subscriptions; when it cannot, the signed webhook does.
      await refreshPro(await grantPaidMonth(u));
      return NextResponse.redirect(`${SITE}/dashboard?welcome=pro${after}`, 303);
    }
  }
  return NextResponse.redirect(`${SITE}/pricing?error=1`, 303);
}
