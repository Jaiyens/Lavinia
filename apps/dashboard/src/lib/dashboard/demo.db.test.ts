import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { loadDashboard } from "./load";

// Two guarantees proven here against a throwaway Postgres db (never dev.db):
//   - Story 5.3 AC2: the public Tour is pinned to the DEMO farm, so a real grower's data
//     never leaks to an unauthenticated visitor even when a real connected farm exists.
//   - C2 (multi-tenant ownership): dashboardFarm is owner-scoped on Farm.userId, so it
//     resolves a real farm ONLY for the user who owns it - never for another user, and
//     never for an un-owned (no userId) request.

let db: TestDb;
let prisma: PrismaClient;
let demoId: string;
let realId: string;
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  // The owner of the real farm, and a second unrelated signed-in user (the cross-tenant probe).
  const owner = await prisma.user.create({ data: { email: "owner@example.com" } });
  ownerId = owner.id;
  const other = await prisma.user.create({ data: { email: "other@example.com" } });
  otherId = other.id;

  const demo = await prisma.farm.create({ data: { name: "Demo Farm", isDemo: true } });
  demoId = demo.id;
  // A real connected farm owned by `owner`: not demo, ACTIVE pge_smd connection, userId set.
  const real = await prisma.farm.create({
    data: {
      name: "Real Farm",
      isDemo: false,
      userId: ownerId,
      connections: { create: [{ type: "pge_smd", status: "active" }] },
    },
  });
  realId = real.id;
});

afterAll(async () => {
  await db?.cleanup();
});

describe("demoFarm vs dashboardFarm", () => {
  it("demoFarm returns the demo even when a real connected farm exists (no leak)", async () => {
    const demo = await demoFarm(prisma);
    expect(demo?.farm.id).toBe(demoId);
    expect(demo?.dataKind).toBe("representative");
  });

  it("dashboardFarm resolves the real farm for ITS OWNER (separation, never merged)", async () => {
    const resolved = await dashboardFarm(prisma, ownerId);
    expect(resolved?.farm.id).toBe(realId);
    expect(resolved?.dataKind).toBe("real");
  });

  it("dashboardFarm hides the real farm from a DIFFERENT user (C2: no cross-tenant)", async () => {
    const resolved = await dashboardFarm(prisma, otherId);
    expect(resolved?.farm.id).toBe(demoId);
    expect(resolved?.dataKind).toBe("representative");
  });

  it("dashboardFarm with no userId never resolves a real farm (un-owned request)", async () => {
    const resolved = await dashboardFarm(prisma);
    expect(resolved?.farm.id).toBe(demoId);
    expect(resolved?.dataKind).toBe("representative");
  });

  it("loadDashboard({demoOnly}) resolves the demo, not the real farm", async () => {
    const dash = await loadDashboard(prisma, { demoOnly: true });
    expect(dash?.farm.id).toBe(demoId);
    expect(dash?.dataKind).toBe("representative");
  });

  it("loadDashboard owner-scopes: the owner gets the real farm, another user gets the demo", async () => {
    const mine = await loadDashboard(prisma, { userId: ownerId });
    expect(mine?.farm.id).toBe(realId);
    expect(mine?.dataKind).toBe("real");

    const theirs = await loadDashboard(prisma, { userId: otherId });
    expect(theirs?.farm.id).toBe(demoId);
    expect(theirs?.dataKind).toBe("representative");
  });
});
