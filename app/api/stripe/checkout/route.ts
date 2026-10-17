import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { createCheckout, stripeReady } from "@/lib/stripe";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${SITE}/signup?next=pro`, 303);
  if (!stripeReady()) return NextResponse.json({ error: "payment unavailable" }, { status: 503 });
  const url = await createCheckout(user);
  if (!url) return NextResponse.json({ error: "payment unavailable" }, { status: 502 });
  return NextResponse.redirect(url, 303);
}
