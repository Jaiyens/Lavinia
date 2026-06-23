import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import { isEmailAllowed, parseAllowlist } from "@/lib/auth-allowlist";

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

// "Log in every time" (PG&E-style, because this is the grower's private utility data).
// We make the session-token cookie a BROWSER-SESSION cookie (see `cookies` below): it
// carries no maxAge, so the browser drops it on close and the next fresh open requires a
// new sign-in. A short JWT maxAge (lib/auth.ts) caps a long-lived open tab too.
//
// The `__Secure-` name prefix and the `secure` flag are MANDATORY on https and FORBIDDEN
// on http (the browser silently rejects a secure cookie over http, which would break local
// dev and the `next start` e2e). So both are gated on the same check: are we actually on
// Vercel (always https) or pointed at an https AUTH_URL. NODE_ENV is deliberately NOT used
// here - `next start` runs as production over http in the e2e and must stay on plain cookies.
const useSecureCookies =
  Boolean(process.env.VERCEL) ||
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "").startsWith("https://");
const sessionCookieName = `${useSecureCookies ? "__Secure-" : ""}authjs.session-token`;

/**
 * The public surface. Everything NOT public requires a session. Route groups ((app),
 * (auth)) are invisible in the URL, so we gate by an allowlist of real paths, not by an
 * "(app)" prefix:
 *  - /login                the sign-in page itself ((auth) group)
 *  - /api/auth/*           the Auth.js HTTP handler (sign-in/callback/verify)
 * Next internals and static assets are excluded by the middleware matcher, not here.
 *
 * The legacy `/dashboard/*` tree was public; it is NOW sign-in gated. It exposed a
 * cross-farm leak (an unauthenticated read of any recommendation by id, and an
 * unauthenticated write that flipped any farm's findings). Gating it closes both vectors;
 * loadRecDetail + resolveRecommendation are additionally farm-scoped so no authed member
 * can read or mutate another farm's rows either.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  // The public "Tour a sample" dashboard (Story 5.3): zero commitment, no sign-in. It is
  // pinned to the demo farm, so no real grower data is ever exposed. The tour is the FULL
  // shell now (Home + Energy + findings + Almond), so its subroutes (/tour/energy) are
  // public too.
  if (pathname === "/tour" || pathname.startsWith("/tour/")) return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  return false;
}

export const authConfig: NextAuthConfig = {
  // Trust the host header. Auth.js v5 otherwise rejects sign-in/session/callback requests
  // under self-hosted `next start` (the e2e runner) with UntrustedHost. Vercel sets this
  // automatically in prod, but `trustHost: true` keeps `next start` and previews working too.
  trustHost: true,
  // Only adapter-free providers here (edge-safe). The email magic-link provider is added
  // in lib/auth.ts, where the Prisma adapter it requires is available.
  providers: [...googleProvider],
  // Browser-session sign-in (see useSecureCookies note above): no maxAge on the cookie, so
  // it is cleared when the browser closes and the grower signs in again on the next visit.
  // Defined in this SHARED config so the edge middleware and the node handlers read/write
  // the exact same cookie name (a mismatch would lock everyone out).
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  pages: {
    signIn: "/login",
    // After requesting a magic link, return to the login page in its "check your email"
    // state instead of Auth.js's default verify-request screen.
    verifyRequest: "/login?sent=email",
    error: "/login",
  },
  callbacks: {
    // The pre-launch access gate. Runs on EVERY sign-in attempt (Google SSO and the email
    // magic-link verify), BEFORE the adapter persists or creates a user, so a non-allowlisted
    // email can neither sign in nor land a row in the User table. Returning false aborts
    // sign-in and Auth.js redirects to `pages.error` (/login), where ?error renders the
    // "access not enabled yet" copy.
    //
    // The allowlist comes from the AUTH_ALLOWLIST env var (comma-separated emails), read here
    // rather than in the pure helper so the helper stays testable. FAIL CLOSED: an unset or
    // empty AUTH_ALLOWLIST allows no one. To add a grower's manager, append their email to
    // AUTH_ALLOWLIST in the Vercel env (no code change). To open sign-in fully, set it to "*".
    signIn({ user }) {
      return isEmailAllowed(user?.email, parseAllowlist(process.env.AUTH_ALLOWLIST));
    },
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
