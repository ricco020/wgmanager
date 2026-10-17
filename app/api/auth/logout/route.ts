import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";
import { SITE } from "@/lib/site";

export async function POST() {
  const res = NextResponse.redirect(`${SITE}/`, 303);
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
