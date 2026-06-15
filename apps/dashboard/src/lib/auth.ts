import NextAuth from "next-auth";
import type { EmailConfig } from "@auth/core/providers/email";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { terraPrismaAdapter } from "@/lib/auth-adapter";
import { sendMagicLink } from "@/lib/email";

// Email magic link (no passwords). Built as a plain `type: "email"` provider object rather
// than the Nodemailer factory on purpose: that factory hard-imports `nodemailer` (an
// uninstalled peer) and throws without an SMTP `server`. Its sendVerificationRequest
// delegates to the stubbed sender in lib/email.ts. This provider REQUIRES the adapter (for
// the VerificationToken table), so it lives here in the full config, never in the edge
// auth.config.ts (which has no adapter - including it there raises MissingAdapter).
const magicLinkProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.AUTH_EMAIL_FROM ?? "login@terra.example",
  maxAge: 24 * 60 * 60,
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    await sendMagicLink({ identifier, url });
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
  // Append the adapter-backed email provider to the edge-safe providers from authConfig.
  providers: [...authConfig.providers, magicLinkProvider],
  adapter: terraPrismaAdapter(prisma),
  session: { strategy: "jwt" },
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
