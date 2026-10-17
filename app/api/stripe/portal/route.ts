import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { createPortal } from "@/lib/stripe";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${SITE}/login`, 303);
  const url = await createPortal(user);
  if (!url) return NextResponse.redirect(`${SITE}/pricing`, 303);
  return NextResponse.redirect(url, 303);
}
