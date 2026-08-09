// ─── Proxy (Next.js 16 — renamed from middleware.ts) ────────
import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuth = !!req.auth?.user;

  // Protected routes
  if (pathname.startsWith("/manage") && !isAuth) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  if (pathname.startsWith("/dashboard") && !isAuth) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  // If authenticated user visits auth pages, redirect to dashboard
  if (isAuth && (pathname.startsWith("/auth/signin") || pathname.startsWith("/auth/signup"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/manage/:path*", "/dashboard/:path*", "/auth/:path*"],
};