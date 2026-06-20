import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { createFarmFromConnection } from "./farm";

// Phase 1: a farm created by the signed-in operator is owned ATOMICALLY - the advisory
// Farm.userId pointer and the owner FarmMembership are written in the same insert, so an
// interrupted identify can never strand an owner-less real farm. Legacy/demo helpers that pass
// no userId still create unowned farms. Throwaway Postgres on the local cluster; never dev.db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

describe("createFarmFromConnection ownership", () => {
  it("creates an UNOWNED farm with no membership when no userId is passed", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "Unowned" });
    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    expect(farm?.userId).toBeNull();
    expect(await prisma.farmMembership.count({ where: { farmId } })).toBe(0);
  });

  it("creates an OWNED farm with exactly one owner/active membership when userId is passed", async () => {
    const user = await prisma.user.create({ data: { email: "owner@farm.com" } });
    const { farmId } = await createFarmFromConnection(prisma, { name: "Owned", userId: user.id });

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    expect(farm?.userId).toBe(user.id);

    const memberships = await prisma.farmMembership.findMany({ where: { farmId } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.userId).toBe(user.id);
    expect(memberships[0]?.role).toBe("owner");
    expect(memberships[0]?.status).toBe("active");
  });
});
