import { NextResponse, type NextRequest } from "next/server";

const REF_RE = /^[a-z0-9-]{1,40}$/;

/** Stores ?ref=<channel> in a 30-day cookie so the signup can be attributed to the channel
 *  that brought the visitor (VPNSmith tool, VPNSmith article, Reddit, directory...). */
const CANONICAL = (() => { try { return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host; } catch { return ""; } })();

export function middleware(req: NextRequest) {
  // One public host: the Railway subdomain keeps working for old links but sends the visitor
  // (query string, hence ?ref=, included) to the custom domain.
  const host = req.headers.get("host") ?? "";
  if (CANONICAL && host.endsWith(".up.railway.app") && host !== CANONICAL) {
    return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL}`), 308);
  }
  const ref = req.nextUrl.searchParams.get("ref")?.toLowerCase() ?? "";
  if (!REF_RE.test(ref) || req.cookies.get("wg_ref")?.value === ref) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set("wg_ref", ref, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600, secure: process.env.NODE_ENV === "production" });
  return res;
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
