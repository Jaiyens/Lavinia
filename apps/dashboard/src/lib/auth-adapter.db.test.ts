import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { authAccountClient, terraPrismaAdapter } from "./auth-adapter";
import { checkVerifyAttempt, resetLoginRateLimits } from "./auth/login-rate-limit";

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

  it("normalizes email so two casings are ONE user (createUser stores + getUserByEmail finds)", async () => {
    const adapter = terraPrismaAdapter(prisma);
    const created = await adapter.createUser!({
      id: "u_case",
      email: "Bob@Farm.COM",
      emailVerified: null,
      name: "Bob",
      image: null,
    });
    // Stored in the one canonical (lowercased) form, never the typed casing.
    expect(created.email).toBe("bob@farm.com");

    // Every casing resolves to the SAME row, so a person can never split into two users
    // (and an invite can never be claimed by the wrong identity).
    const lower = await adapter.getUserByEmail!("bob@farm.com");
    const upper = await adapter.getUserByEmail!("BOB@FARM.COM");
    expect(lower?.id).toBe(created.id);
    expect(upper?.id).toBe(created.id);
  });
});

// SINGLE ACTIVE CODE (6-digit sign-in flow). Minting a new code must delete the prior code for
// the same email (so an older/forwarded code can never sign someone in) and reset that email's
// verify budget (so "Send a new code" gives a clean set of tries). Delete is scoped by identifier.
describe("terraPrismaAdapter.createVerificationToken", () => {
  const expires = () => new Date(Date.now() + 10 * 60_000);

  it("deletes the prior code for the same email and resets the verify budget", async () => {
    resetLoginRateLimits();
    const adapter = terraPrismaAdapter(prisma);
    const identifier = "code-grower@example.com";

    await adapter.createVerificationToken!({ identifier, token: "hash-old", expires: expires() });
    // Spend two of the five verify tries against the old code.
    checkVerifyAttempt(identifier);
    checkVerifyAttempt(identifier);

    await adapter.createVerificationToken!({ identifier, token: "hash-new", expires: expires() });

    // Only the newest code survives.
    const tokens = await prisma.verificationToken.findMany({ where: { identifier } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.token).toBe("hash-new");

    // And the budget was reset: a full five fresh tries against the new code.
    for (let i = 0; i < 5; i++) expect(checkVerifyAttempt(identifier).allowed).toBe(true);
    expect(checkVerifyAttempt(identifier).allowed).toBe(false);

    await prisma.verificationToken.deleteMany({ where: { identifier } });
  });

  it("scopes the delete by identifier (a different email keeps its own code)", async () => {
    const adapter = terraPrismaAdapter(prisma);
    await adapter.createVerificationToken!({ identifier: "keep-a@example.com", token: "tok-a", expires: expires() });
    await adapter.createVerificationToken!({ identifier: "keep-b@example.com", token: "tok-b", expires: expires() });

    expect(await prisma.verificationToken.count({ where: { identifier: "keep-a@example.com" } })).toBe(1);
    expect(await prisma.verificationToken.count({ where: { identifier: "keep-b@example.com" } })).toBe(1);

    await prisma.verificationToken.deleteMany({
      where: { identifier: { in: ["keep-a@example.com", "keep-b@example.com"] } },
    });
  });
});
