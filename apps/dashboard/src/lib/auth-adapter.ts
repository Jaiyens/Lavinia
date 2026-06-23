import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { Adapter } from "next-auth/adapters";
import { normalizeEmail } from "@/lib/email-normalize";
import { resetVerifyAttempts } from "@/lib/auth/login-rate-limit";

// The collision-safe Prisma adapter for Auth.js v5 (Story 5.1). Pulled out of lib/auth.ts
// so it can be unit-tested with a throwaway PrismaClient without importing NextAuth.
//
// @auth/prisma-adapter calls a delegate named `account` for OAuth account links, but Terra
// already has `model Account` (the PG&E billing account), which must not be touched. So the
// OAuth-link model is `AuthAccount` and we hand the adapter a Proxy of the client whose
// `.account` resolves to `prisma.authAccount`. Every other delegate passes straight through.

/** A view of the client where `.account` resolves to the `authAccount` delegate. */
export function authAccountClient(prisma: PrismaClient): PrismaClient {
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop === "account") return target.authAccount;
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}

/**
 * The Auth.js adapter wired to Terra's renamed `AuthAccount` model, with TWO boundary wrappers:
 *
 * 1) Email normalization. createUser / getUserByEmail / updateUser all run their email through
 *    normalizeEmail, so however a provider casts the address (a typed code, a Google `email`
 *    claim), there is exactly ONE stored form. That is what makes `Bob@x.com` and `bob@x.com`
 *    the same person instead of two User rows, and what lets invites match by email reliably.
 *    (Belt-and-suspenders with the `@db.Citext` column added in the membership migration; the
 *    column protects any future write path that skips this wrapper.)
 *
 * 2) Single active code. createVerificationToken is called once per emailed code (the initial
 *    "Send code" and every "Send a new code"). Before the new code's hash is stored we delete
 *    any prior unused code for the same email, so an older code can never sign someone in, and
 *    the per-email verify budget is reset so "Send a new code" hands the operator a clean set of
 *    tries. Uses the raw `prisma` (not the account-proxy) for that delete - the proxy only
 *    special-cases `.account`. Every other adapter method passes straight through PrismaAdapter.
 */
export function terraPrismaAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(authAccountClient(prisma));
  return {
    ...base,
    createUser(user) {
      const email = user.email ? normalizeEmail(user.email) : user.email;
      return base.createUser!({ ...user, email });
    },
    getUserByEmail(email) {
      return base.getUserByEmail!(normalizeEmail(email));
    },
    updateUser(user) {
      const email = user.email ? normalizeEmail(user.email) : user.email;
      return base.updateUser!({ ...user, email });
    },
    async createVerificationToken(token) {
      await prisma.verificationToken.deleteMany({ where: { identifier: token.identifier } });
      resetVerifyAttempts(token.identifier);
      return base.createVerificationToken!(token);
    },
  };
}
