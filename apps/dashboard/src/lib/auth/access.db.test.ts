import type { FarmRole, MembershipStatus, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { canAccessFarm, farmRole, requireRole } from "./access";
import { currentFarm } from "@/lib/onboarding/farm";

// The tenant gate end to end against a throwaway Postgres: access is an ACTIVE FarmMembership
// (never Farm.userId), currentFarm resolves a ready farm only for an active member, a removed
// member loses access on the next read, and the active-farm selection cannot widen access to a
// farm the user is not a member of.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

/** A non-demo farm finalized to "ready" (an active pge_smd connection). */
async function readyFarm(name: string): Promise<string> {
  const farm = await prisma.farm.create({
    data: { name, isDemo: false, connections: { create: [{ type: "pge_smd", status: "active" }] } },
  });
  return farm.id;
}

async function addMember(
  farmId: string,
  email: string,
  role: FarmRole,
  status: MembershipStatus = "active",
): Promise<string> {
  const user = await prisma.user.create({ data: { email: `${email}@example.com` } });
  await prisma.farmMembership.create({ data: { farmId, userId: user.id, role, status } });
  return user.id;
}

describe("access gate", () => {
  it("farmRole / canAccessFarm / requireRole reflect the active membership and rank", async () => {
    const farmId = await readyFarm("Gate Farm");
    const ownerId = await addMember(farmId, "gate-owner", "owner");
    const viewerId = await addMember(farmId, "gate-viewer", "viewer");
    const stranger = await prisma.user.create({ data: { email: "gate-stranger@example.com" } });

    expect(await farmRole(prisma, farmId, ownerId)).toBe("owner");
    expect(await farmRole(prisma, farmId, viewerId)).toBe("viewer");
    expect(await farmRole(prisma, farmId, stranger.id)).toBeNull();
    expect(await farmRole(prisma, farmId, null)).toBeNull();

    expect(await canAccessFarm(prisma, farmId, viewerId)).toBe(true);
    expect(await canAccessFarm(prisma, farmId, stranger.id)).toBe(false);

    // A viewer is read-only: cannot meet the manager write bar; an owner can.
    expect(await requireRole(prisma, farmId, viewerId, "manager")).toBe(false);
    expect(await requireRole(prisma, farmId, ownerId, "manager")).toBe(true);
    expect(await requireRole(prisma, farmId, viewerId, "viewer")).toBe(true);
  });
});

describe("currentFarm membership scoping", () => {
  it("resolves a ready farm for an active member, never for a non-member", async () => {
    const farmId = await readyFarm("Member Farm");
    const memberId = await addMember(farmId, "scoped-member", "manager");
    const stranger = await prisma.user.create({ data: { email: "scoped-stranger@example.com" } });

    expect((await currentFarm(prisma, memberId))?.id).toBe(farmId);
    // A connected (ready) farm the stranger is NOT a member of must never resolve for them.
    expect(await currentFarm(prisma, stranger.id)).toBeNull();
  });

  it("a removed member loses access immediately on the next read", async () => {
    const farmId = await readyFarm("Removed Farm");
    const userId = await addMember(farmId, "to-be-removed", "manager");
    expect((await currentFarm(prisma, userId))?.id).toBe(farmId);

    await prisma.farmMembership.updateMany({
      where: { farmId, userId },
      data: { status: "removed", removedAt: new Date() },
    });

    expect(await canAccessFarm(prisma, farmId, userId)).toBe(false);
    expect(await currentFarm(prisma, userId)).toBeNull();
  });

  it("honors the active-farm selection but never widens access to a non-member farm", async () => {
    const user = await prisma.user.create({ data: { email: "multi-farm@example.com" } });
    const farmA = await readyFarm("Multi A");
    const farmB = await readyFarm("Multi B");
    await prisma.farmMembership.create({ data: { farmId: farmA, userId: user.id, role: "owner", status: "active" } });
    await prisma.farmMembership.create({ data: { farmId: farmB, userId: user.id, role: "owner", status: "active" } });
    const foreign = await readyFarm("Foreign");

    // Explicit selection resolves that exact accessible farm.
    expect((await currentFarm(prisma, user.id, farmA))?.id).toBe(farmA);
    expect((await currentFarm(prisma, user.id, farmB))?.id).toBe(farmB);

    // A farm the user is NOT a member of is ignored: it falls back to one of THEIR farms,
    // never the foreign farm.
    const picked = await currentFarm(prisma, user.id, foreign);
    expect([farmA, farmB]).toContain(picked?.id);
    expect(picked?.id).not.toBe(foreign);
  });
});
