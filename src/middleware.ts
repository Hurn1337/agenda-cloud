import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Skip auth check for API routes and static files
  if (
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname.startsWith("/_next/") ||
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname === "/logo.png" ||
    request.nextUrl.pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("agenda_auth");
  if (authCookie?.value === "authenticated") {
    return NextResponse.next();
  }

  // Redirect to login page
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
