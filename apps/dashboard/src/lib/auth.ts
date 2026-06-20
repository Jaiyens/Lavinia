import { randomInt } from "node:crypto";
import NextAuth from "next-auth";
import type { EmailConfig } from "@auth/core/providers/email";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { terraPrismaAdapter } from "@/lib/auth-adapter";
import { sendLoginCode } from "@/lib/email";

// How long a sign-in code stays valid. Short on purpose: a 6-digit code is brute-forceable
// (1,000,000 combinations), so the verification window is the main limiter. The code is also
// single-use (Auth.js deletes the VerificationToken row on a correct guess). For higher
// assurance, add a rate limit / Vercel BotID on /api/auth/callback/email (see the redesign
// note). 10 minutes balances "didn't arrive yet" against the brute-force window.
const CODE_TTL_SECONDS = 10 * 60;

/** A cryptographically-uniform 6-digit code, zero-padded ("000000"-"999999"). */
function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Passwordless email sign-in via a typed 6-digit CODE (not a magic link). Built as a plain
// `type: "email"` provider object rather than the Nodemailer factory on purpose: that factory
// hard-imports `nodemailer` (an uninstalled peer) and throws without an SMTP `server`.
//
// `generateVerificationToken` makes Auth.js mint our 6-digit code as the verification token:
// it stores sha256(code + AUTH_SECRET) in the VerificationToken table and hands the plaintext
// code to `sendVerificationRequest` as `token`. The login page's code-entry form then GETs
// /api/auth/callback/email?token=<code>&email=<identifier>, which Auth.js verifies exactly
// like a clicked magic link (re-hash, match, check expiry, single-use), then signs the user
// in. This provider REQUIRES the adapter (for the VerificationToken table), so it lives here
// in the full config, never in the edge auth.config.ts (no adapter -> MissingAdapter).
const emailCodeProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.AUTH_EMAIL_FROM ?? "login@terra.example",
  maxAge: CODE_TTL_SECONDS,
  options: {},
  generateVerificationToken: generateLoginCode,
  async sendVerificationRequest({ identifier, token }) {
    await sendLoginCode({ identifier, code: token });
  },
};

// Full (Node-only) half of the Auth.js v5 config (Story 5.1). Spreads the edge-safe
// authConfig and adds the Prisma adapter + JWT session strategy. Server Components,
// Server Actions, and the route handler import `auth`/`handlers`/`signIn`/`signOut`
// from here; the middleware imports only auth.config.ts (no adapter on the edge).
//
// THE ACCOUNT-NAME COLLISION. @auth/prisma-adapter calls a delegate named `account`
// for OAuth account links, but Terra already has `model Account` (the PG&E billing
// account) which must not be touched. So the auth model is `AuthAccount` and we hand the
// adapter a Proxy of the client whose `.account` resolves to `prisma.authAccount`. Every
// other delegate (user, session, verificationToken) passes straight through.
//
// SESSIONS ARE JWT, NOT DATABASE. The adapter defaults to database sessions, which the
// edge middleware cannot validate (no Prisma on the edge). JWT sessions ride in the
// signed cookie the middleware reads. The adapter is still used for User/AuthAccount
// persistence + OAuth linking + the VerificationToken the magic link needs; the Session
// table is created by the migration but left unpopulated under JWT (kept for schema
// completeness and a possible future switch to database sessions). The adapter wrapper
// lives in lib/auth-adapter.ts so it is unit-testable without importing NextAuth.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Append the adapter-backed email code provider to the edge-safe providers from authConfig.
  providers: [...authConfig.providers, emailCodeProvider],
  adapter: terraPrismaAdapter(prisma),
  // JWT sessions, capped at 4 hours. Paired with the browser-session cookie in
  // auth.config.ts this gives the "log in every time" policy: a fresh browser open always
  // re-authenticates (cookie cleared on close), and even a tab left open all day expires
  // after 4h. Short on purpose - this is the grower's private PG&E data.
  session: { strategy: "jwt", maxAge: 4 * 60 * 60 },
});

/**
 * The signed-in operator's user id, or null when there is no session. The single source
 * for owner-scoping dashboard reads (dashboardFarm/loadDashboard) and onboarding writes -
 * passing this id is what keeps one grower from resolving another's farm (multi-tenant
 * isolation). The id rides on the JWT (auth.config.ts jwt/session callbacks), so this is
 * a cookie read, not a DB lookup.
 */
export async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
