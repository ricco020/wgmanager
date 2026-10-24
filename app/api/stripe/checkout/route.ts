import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { createCheckout, stripeReady } from "@/lib/stripe";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${SITE}/signup?next=pro`, 303);
  if (!stripeReady()) return NextResponse.json({ error: "payment unavailable" }, { status: 503 });
  // "import": the visitor hit the free limit while importing; the file waits in the tab and the form reopens after payment.
  const next = (await req.formData().catch(() => null))?.get("next") === "import" ? "import" : undefined;
  const url = await createCheckout(user, next);
  if (!url) return NextResponse.json({ error: "payment unavailable" }, { status: 502 });
  return NextResponse.redirect(url, 303);
}
