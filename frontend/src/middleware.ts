import { NextResponse, type NextRequest } from "next/server";

/**
 * Closes the shop without closing the office.
 *
 * Turned on while work is going on behind the scenes that customers should not
 * be ordering into. The admin panel stays open — whoever switched this on still
 * has to be able to see what is happening — and so do the API and the static
 * files the maintenance page itself is built from.
 *
 * Switched with the NEXT_PUBLIC_MAINTENANCE environment variable in Vercel:
 * set it to 1 to close the shop, remove it or set 0 to reopen. Nothing is
 * cached against it, so the change takes effect as soon as the redeploy lands.
 *
 * This stops people reaching the shop. It is not the last word on orders — the
 * checkout refuses them server-side too, because a page already open in
 * somebody's browser does not know the shop has closed.
 */
const MAINTENANCE = process.env.NEXT_PUBLIC_MAINTENANCE === "1";

/** Paths that must keep working while the shop is closed. */
const ALWAYS_OPEN = [
  "/admin",          // the office
  "/login",          // and the way into it
  "/api",
  "/_next",          // the framework's own assets
  "/maintenance",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export function middleware(request: NextRequest) {
  if (!MAINTENANCE) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (ALWAYS_OPEN.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  // Any other file with an extension is an asset — an image, a font — and the
  // maintenance page needs them as much as any other page does.
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  // Rewrite rather than redirect: the address the customer typed stays in the
  // bar, so reopening the shop is one refresh rather than a hunt for the page
  // they were on. 503 is what a crawler needs to see — it means "come back",
  // where a 200 would invite it to index a closed shop.
  return NextResponse.rewrite(url, { status: 503 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
