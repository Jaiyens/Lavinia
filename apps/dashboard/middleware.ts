import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge gate (Story 5.1, AC3). Instantiates Auth.js with ONLY the edge-safe config (no
// Prisma adapter), so the `authorized` callback runs on the signed JWT cookie with no
// database call. It redirects unauthenticated requests for protected routes to /login;
// public paths (see isPublicPath in auth.config.ts) pass through. The authoritative gate
// is still the auth() check in (app)/layout.tsx - this is the fast pre-render redirect.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on page routes only. Exclude the Auth.js handler (/api/*), Next internals, the
  // favicon, AND any path with a file extension (the `.*\.` term) so /public static assets
  // (/logo.svg, videos, images) are served directly instead of 307-redirected to /login.
  // Page routes (/ , /energy, /settings, /login, /dashboard/*) carry no dot and still pass
  // through the `authorized` callback.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
