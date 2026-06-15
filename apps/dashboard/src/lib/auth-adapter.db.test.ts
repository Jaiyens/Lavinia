import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { authAccountClient, terraPrismaAdapter } from "./auth-adapter";

// Proves the Account-collision wrapper (Story 5.1, AC1): @auth/prisma-adapter calls a
// delegate named `account`, but Terra's `Account` is the PG&E billing account. The wrapper
// must route the adapter's account operations to the renamed `AuthAccount` model and leave
// the PG&E Account untouched. Throwaway Postgres on the local test cluster; never dev.db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

describe("authAccountClient", () => {
  it("routes the `account` delegate to authAccount and passes others through", () => {
    const wrapped = authAccountClient(prisma);
    expect(wrapped.account).toBe(prisma.authAccount);
    expect(wrapped.user).toBe(prisma.user);
    expect(wrapped.verificationToken).toBe(prisma.verificationToken);
  });
});

describe("terraPrismaAdapter", () => {
  it("creates a user and links an OAuth account into AuthAccount (not the PG&E Account)", async () => {
    const adapter = terraPrismaAdapter(prisma);
    // The adapter is fully populated by PrismaAdapter; these are always defined.
    const user = await adapter.createUser!({
      id: "u_test",
      email: "grower@example.com",
      emailVerified: null,
      name: "Test Grower",
      image: null,
    });
    await adapter.linkAccount!({
      userId: user.id,
      type: "oauth",
      provider: "google",
      providerAccountId: "google-123",
    });

    // The link landed in AuthAccount...
    const authAccounts = await prisma.authAccount.findMany();
    expect(authAccounts).toHaveLength(1);
    expect(authAccounts[0]?.provider).toBe("google");
    expect(authAccounts[0]?.userId).toBe(user.id);

    // ...and getUserByAccount reads it back through the wrapped delegate.
    const found = await adapter.getUserByAccount!({
      provider: "google",
      providerAccountId: "google-123",
    });
    expect(found?.id).toBe(user.id);

    // The PG&E Account table is a different model and was never written by auth.
    const pgeAccounts = await prisma.account.count();
    expect(pgeAccounts).toBe(0);
  });
});
