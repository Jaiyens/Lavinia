import NextAuth from "next-auth";
import type { EmailConfig } from "@auth/core/providers/email";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { terraPrismaAdapter } from "@/lib/auth-adapter";
import { normalizeEmail } from "@/lib/email-normalize";
import { isStaticallyAllowed } from "@/lib/auth/allowlist";
import { claimInvitesForUser, emailHasFarmAccess } from "@/lib/auth/invite";
import { generateLoginCode } from "@/lib/auth/login-code";
import { sendLoginCode } from "@/lib/email";

// How long a sign-in code stays valid. Short on purpose: a 6-digit code is brute-forceable
// (1,000,000 combinations), so the verification window is one of the limiters. The defense in
// depth is: (1) this 10-min expiry, (2) the per-email VERIFY budget that invalidates the code
// after 5 wrong tries, and (3) the per-email REQUEST budget that bounds resends - both in
// lib/auth/login-rate-limit.ts, enforced at the email callback route and the requestCode action.
// Vercel BotID at the edge is the complementary durable layer. The code is also single-use
// (Auth.js deletes the VerificationToken row on a correct guess), and minting a new code deletes
// any prior one (lib/auth-adapter.ts). 10 minutes balances "didn't arrive yet" against the window.
const CODE_TTL_SECONDS = 10 * 60;

export const DEV_BYPASS_EMAIL = "jaiyen_shetty@berkeley.edu";
const isDevBypassEnabled = process.env.NODE_ENV !== "production";

const devBypassProvider = isDevBypassEnabled
  ? [
      Credentials({
        id: "dev-bypass",
        name: "Dev Bypass",
        credentials: { email: { type: "email" } },
        async authorize(credentials) {
          const email =
            typeof credentials?.email === "string" ? credentials.email.toLowerCase().trim() : "";
          if (email !== DEV_BYPASS_EMAIL) return null;
          const user = await prisma.user.upsert({
            where: { email },
            update: {},
            create: { email, name: "Jaiyen Shetty" },
          });
          return user;
        },
      }),
    ]
  : [];

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
  // In dev, also append the dev-bypass credentials provider for code-free local sign-in.
  providers: [...authConfig.providers, emailCodeProvider, ...devBypassProvider],
  adapter: terraPrismaAdapter(prisma),
  // JWT sessions, capped at 4 hours. Paired with the browser-session cookie in
  // auth.config.ts this gives the "log in every time" policy: a fresh browser open always
  // re-authenticates (cookie cleared on close), and even a tab left open all day expires
  // after 4h. Short on purpose - this is the grower's private PG&E data.
  session: { strategy: "jwt", maxAge: 4 * 60 * 60 },
  callbacks: {
    // Keep the edge-safe gate/jwt/session callbacks from authConfig, and add the Node-only
    // sign-in DENY hook here (it needs the email + the OIDC profile, and later prisma). It runs
    // on the /api/auth route handler, never on the edge middleware (which uses authConfig
    // directly and has no signIn callback).
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // 1) Email control. A Google sign-in MUST carry a verified email - otherwise "a verified
      //    email IS the person" (the basis for the allowlist and for invite claims in Phase 3)
      //    is forgeable by anyone who controls an OIDC tenant. Magic-link sign-ins prove inbox
      //    control by definition, so they are exempt.
      if (account?.provider === "google") {
        const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
        if (emailVerified !== true) return false;
      }
      // 2) Pre-launch lockdown. Off unless ACCESS_ALLOWLIST is set. When on, sign-in is allowed
      //    if the email is on the static allowlist OR has farm standing (an active membership or a
      //    pending, non-expired invite) - so an invited teammate can sign in during lockdown. An
      //    invite is NOT auto-added to the static allowlist, so a revoke removes standing fully.
      //    Uniform `false` on any denial so the gate cannot be used to enumerate.
      const email = user?.email ? normalizeEmail(user.email) : null;
      if (!isStaticallyAllowed(email) && !(await emailHasFarmAccess(prisma, email))) {
        return false;
      }
      return true;
    },
  },
  events: {
    // The invite-claim hook. Runs server-side on EVERY successful sign-in (new and returning),
    // after the signIn callback above has already proven the email is verified. It is the ONLY
    // place a pending FarmInvite becomes an active membership, and it matches on the normalized
    // email only - a sign-in as a different address never claims someone else's invite. Non-
    // blocking by design: the return is ignored, so a DB hiccup here never locks the user out.
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        await claimInvitesForUser(prisma, { id: user.id, email: user.email });
      } catch (err) {
        // Best-effort: the invite stays pending and is retried on the next sign-in.
        console.error("[invite-claim] failed:", err instanceof Error ? err.message : err);
      }
    },
  },
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
