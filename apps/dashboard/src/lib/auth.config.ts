import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";

// Edge-SAFE half of the Auth.js v5 config (Story 5.1). This file holds everything the
// middleware needs to gate routes - the sign-in page, the authorized/jwt/session
// callbacks, and only adapter-free providers - and imports NO Prisma adapter, so it
// ships in the edge middleware bundle without pulling the database client onto the edge.
// The full config (adapter + JWT session strategy + the email magic-link provider, which
// REQUIRES the adapter) lives in lib/auth.ts and spreads this in.
//
// Sessions are JWT (set in lib/auth.ts), NOT database sessions, precisely so the
// `authorized` callback below can run on the edge off the signed cookie with no DB call.

// Google SSO, registered only when both env vars are present. Keeping it conditional
// means `next build` and the Playwright e2e (which carry no Google creds) do not crash;
// the magic-link path still proves the gate. Env names use the AUTH_ prefix Auth.js
// reads automatically (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET). Google needs no adapter, so
// it is edge-safe here; the email provider (which needs the adapter) is added in auth.ts.
const googleProvider: Provider[] =
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : [];

/**
 * The public surface. Everything NOT public requires a session. Route groups ((app),
 * (auth)) are invisible in the URL, so we gate by an allowlist of real paths, not by an
 * "(app)" prefix:
 *  - /login                the sign-in page itself ((auth) group)
 *  - /api/auth/*           the Auth.js HTTP handler (sign-in/callback/verify)
 *  - /dashboard/*          the legacy pre-rebuild onboarding tree (Story 5.2 replaces it;
 *                          it must keep working and its e2e must stay green - do not gate)
 * Next internals and static assets are excluded by the middleware matcher, not here.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  // The public "Tour a sample" dashboard (Story 5.3): zero commitment, no sign-in. It is
  // pinned to the demo farm, so no real grower data is ever exposed.
  if (pathname === "/tour") return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  return false;
}

export const authConfig: NextAuthConfig = {
  // Trust the host header. Auth.js v5 otherwise rejects sign-in/session/callback requests
  // under self-hosted `next start` (the e2e runner) with UntrustedHost. Vercel sets this
  // automatically in prod, but `trustHost: true` keeps `next start` and previews working too.
  trustHost: true,
  // Multi-Zone basePath ("/dashboard"): Auth.js's basePath is the FULL public path,
  // "/dashboard/api/auth", so the sign-in + OAuth callback URLs it generates keep the
  // "/dashboard" prefix (it builds them as origin + basePath + /callback/<provider>).
  // Next.js STRIPS "/dashboard" from the request before the route handler runs, so the
  // handler in (auth)/api/auth/[...nextauth]/route.ts RE-ADDS it before calling Auth.js;
  // without that, action parsing fails (UnknownAction 400) because the stripped path
  // "/api/auth/*" no longer matches this basePath. The origin in those URLs comes from
  // AUTH_URL (https://tryterra.ai in prod — required because behind the web zone the
  // dashboard's own host is its vercel.app, not tryterra.ai). Google OAuth redirect URI:
  // <origin>/dashboard/api/auth/callback/google.
  basePath: "/dashboard/api/auth",
  // Only adapter-free providers here (edge-safe). The email magic-link provider is added
  // in lib/auth.ts, where the Prisma adapter it requires is available.
  providers: [...googleProvider],
  pages: {
    signIn: "/login",
    // After requesting a magic link, return to the login page in its "check your email"
    // state instead of Auth.js's default verify-request screen.
    verifyRequest: "/login?sent=email",
    error: "/login",
  },
  callbacks: {
    // The middleware gate (AC3). Public paths pass; everything else needs a user. A
    // false return makes the NextAuth middleware redirect to `pages.signIn` (/login).
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return Boolean(auth?.user);
    },
    // Thread the user id onto the JWT so Story 5.2 can resolve User -> owned Farm without
    // a DB lookup in the session callback.
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
};
