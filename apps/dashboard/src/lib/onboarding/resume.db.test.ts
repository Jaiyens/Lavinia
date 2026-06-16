import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { resumableOnboardingFarm } from "./farm";

// Integration test for the resume gate: a signed-in operator who interrupted onboarding
// (a pending, not-yet-finalized farm) is resumed rather than starting fresh, so abandoned
// attempts do not pile up as duplicate farms. Runs against a throwaway Postgres on the local
// test cluster (no network, never touches the dev/prod db).

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

async function makeFarm(
  userId: string | null,
  name: string,
  status: "pending" | "active",
  opts: { isDemo?: boolean; createdAt?: Date } = {},
): Promise<{ id: string }> {
  return prisma.farm.create({
    data: {
      name,
      userId,
      isDemo: opts.isDemo ?? false,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      connections: { create: [{ type: "pge_smd", status }] },
    },
    select: { id: true },
  });
}

describe("resumableOnboardingFarm", () => {
  it("returns null for a signed-out caller", async () => {
    expect(await resumableOnboardingFarm(prisma, null)).toBeNull();
    expect(await resumableOnboardingFarm(prisma, undefined)).toBeNull();
  });

  it("returns null for an operator with no farm", async () => {
    const u = await prisma.user.create({ data: { email: "nofarm@example.com" } });
    expect(await resumableOnboardingFarm(prisma, u.id)).toBeNull();
  });

  it("returns the in-progress (pending) farm for its owner", async () => {
    const u = await prisma.user.create({ data: { email: "pending@example.com" } });
    const f = await makeFarm(u.id, "Pending Farm", "pending");
    expect(await resumableOnboardingFarm(prisma, u.id)).toEqual({ farmId: f.id });
  });

  it("returns null once the farm is finalized (active connection)", async () => {
    const u = await prisma.user.create({ data: { email: "active@example.com" } });
    await makeFarm(u.id, "Active Farm", "active");
    expect(await resumableOnboardingFarm(prisma, u.id)).toBeNull();
  });

  it("is owner-scoped: never another operator's in-progress farm", async () => {
    const owner = await prisma.user.create({ data: { email: "owner@example.com" } });
    const other = await prisma.user.create({ data: { email: "other@example.com" } });
    await makeFarm(owner.id, "Owner Pending", "pending");
    expect(await resumableOnboardingFarm(prisma, other.id)).toBeNull();
  });

  it("picks the most recently created in-progress farm when several exist", async () => {
    const u = await prisma.user.create({ data: { email: "multi@example.com" } });
    await makeFarm(u.id, "Older", "pending", { createdAt: new Date("2024-01-01T00:00:00Z") });
    const newer = await makeFarm(u.id, "Newer", "pending", {
      createdAt: new Date("2024-06-01T00:00:00Z"),
    });
    expect(await resumableOnboardingFarm(prisma, u.id)).toEqual({ farmId: newer.id });
  });

  it("ignores demo farms even when pending", async () => {
    const u = await prisma.user.create({ data: { email: "demo@example.com" } });
    await makeFarm(u.id, "Demo Farm", "pending", { isDemo: true });
    expect(await resumableOnboardingFarm(prisma, u.id)).toBeNull();
  });
});
