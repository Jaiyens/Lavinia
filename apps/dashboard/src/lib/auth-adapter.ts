import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { Adapter } from "next-auth/adapters";

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

/** The Auth.js adapter wired to Terra's renamed `AuthAccount` model. */
export function terraPrismaAdapter(prisma: PrismaClient): Adapter {
  return PrismaAdapter(authAccountClient(prisma));
}
