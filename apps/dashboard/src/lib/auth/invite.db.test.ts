import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { claimInvitesForUser, emailHasFarmAccess, inviteExpiry } from "./invite";

// The invite-claim core: a pending invite becomes an active membership ONLY for the user who signs
// in as the invited (normalized) email, and a different email never claims it.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

async function farm(name: string): Promise<string> {
  const f = await prisma.farm.create({ data: { name, isDemo: false } });
  return f.id;
}

async function pendingInvite(farmId: string, email: string, role: "owner" | "manager" | "viewer" = "manager") {
  return prisma.farmInvite.create({
    data: { farmId, invitedEmail: email, role, expiresAt: inviteExpiry(new Date()) },
  });
}

describe("emailHasFarmAccess", () => {
  it("is true for a pending non-expired invite and an active member, false otherwise", async () => {
    const farmId = await farm("Access Farm");
    await pendingInvite(farmId, "invited@x.com");
    expect(await emailHasFarmAccess(prisma, "Invited@X.com")).toBe(true); // normalized match

    const member = await prisma.user.create({ data: { email: "member@x.com" } });
    await prisma.farmMembership.create({ data: { farmId, userId: member.id, role: "manager", status: "active" } });
    expect(await emailHasFarmAccess(prisma, "member@x.com")).toBe(true);

    expect(await emailHasFarmAccess(prisma, "nobody@x.com")).toBe(false);
    expect(await emailHasFarmAccess(prisma, null)).toBe(false);
  });

  it("is false for an expired or revoked invite", async () => {
    const farmId = await farm("Stale Farm");
    await prisma.farmInvite.create({
      data: { farmId, invitedEmail: "expired@x.com", role: "manager", expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.farmInvite.create({
      data: { farmId, invitedEmail: "revoked@x.com", role: "manager", status: "revoked", expiresAt: inviteExpiry(new Date()) },
    });
    expect(await emailHasFarmAccess(prisma, "expired@x.com")).toBe(false);
    expect(await emailHasFarmAccess(prisma, "revoked@x.com")).toBe(false);
  });
});

describe("claimInvitesForUser", () => {
  it("turns a pending invite into an active membership at the invited role and marks it accepted", async () => {
    const farmId = await farm("Claim Farm");
    const inv = await pendingInvite(farmId, "newteam@x.com", "viewer");
    const user = await prisma.user.create({ data: { email: "newteam@x.com" } });

    const claimed = await claimInvitesForUser(prisma, { id: user.id, email: user.email });
    expect(claimed).toBe(1);

    const membership = await prisma.farmMembership.findUnique({
      where: { farmId_userId: { farmId, userId: user.id } },
    });
    expect(membership?.role).toBe("viewer");
    expect(membership?.status).toBe("active");

    const after = await prisma.farmInvite.findUnique({ where: { id: inv.id } });
    expect(after?.status).toBe("accepted");
    expect(after?.acceptedByUserId).toBe(user.id);
  });

  it("matches on the normalized email only: a different address never claims the invite", async () => {
    const farmId = await farm("No-Cross Farm");
    await pendingInvite(farmId, "intended@x.com");
    const other = await prisma.user.create({ data: { email: "someone-else@x.com" } });

    const claimed = await claimInvitesForUser(prisma, { id: other.id, email: other.email });
    expect(claimed).toBe(0);
    expect(await prisma.farmMembership.count({ where: { farmId, userId: other.id } })).toBe(0);
  });

  it("is idempotent and never changes an existing membership's role", async () => {
    const farmId = await farm("Idempotent Farm");
    const user = await prisma.user.create({ data: { email: "already@x.com" } });
    // Already an owner of this farm.
    await prisma.farmMembership.create({ data: { farmId, userId: user.id, role: "owner", status: "active" } });
    // A later, lower-role invite to the same email.
    await pendingInvite(farmId, "already@x.com", "viewer");

    await claimInvitesForUser(prisma, { id: user.id, email: user.email });
    const membership = await prisma.farmMembership.findUnique({
      where: { farmId_userId: { farmId, userId: user.id } },
    });
    // Their owner role is preserved (the stale invite never downgrades them).
    expect(membership?.role).toBe("owner");
  });

  it("ignores expired invites", async () => {
    const farmId = await farm("Expired Claim Farm");
    await prisma.farmInvite.create({
      data: { farmId, invitedEmail: "late@x.com", role: "manager", expiresAt: new Date(Date.now() - 1000) },
    });
    const user = await prisma.user.create({ data: { email: "late@x.com" } });
    expect(await claimInvitesForUser(prisma, { id: user.id, email: user.email })).toBe(0);
  });
});
