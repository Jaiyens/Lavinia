import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { loadDashboard } from "./load";

// Two guarantees proven here against a throwaway Postgres db (never dev.db):
//   - Story 5.3 AC2: the public Tour is pinned to the DEMO farm, so a real grower's data
//     never leaks to an unauthenticated visitor even when a real connected farm exists.
//   - C2 (multi-tenant ownership): dashboardFarm is membership-scoped, so it resolves a real
//     farm ONLY for a user with an active FarmMembership on it - never for another user, and
//     never for a non-member (no userId) request.

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
  // A real connected farm owned by `owner`: not demo, ACTIVE pge_smd connection, with an owner
  // FarmMembership (the access gate is now membership, not Farm.userId).
  const real = await prisma.farm.create({
    data: {
      name: "Real Farm",
      isDemo: false,
      userId: ownerId,
      memberships: { create: [{ role: "owner", status: "active", user: { connect: { id: ownerId } } }] },
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

  it("dashboardFarm returns null for a signed-in user who owns no farm (-> onboarding, never the demo or another grower's data)", async () => {
    // The gate: an authed operator with no connected farm must be routed to onboarding,
    // not parked on the badged demo (that bug made sign-in skip onboarding). null is also
    // what proves no cross-tenant leak - `otherId` never resolves the owner's real farm.
    const resolved = await dashboardFarm(prisma, otherId);
    expect(resolved).toBeNull();
  });

  it("dashboardFarm with no userId falls back to the demo (the legacy/public /dashboard tree)", async () => {
    const resolved = await dashboardFarm(prisma);
    expect(resolved?.farm.id).toBe(demoId);
    expect(resolved?.dataKind).toBe("representative");
  });

  it("loadDashboard({demoOnly}) resolves the demo, not the real farm", async () => {
    const dash = await loadDashboard(prisma, { demoOnly: true });
    expect(dash?.farm.id).toBe(demoId);
    expect(dash?.dataKind).toBe("representative");
  });

  it("loadDashboard owner-scopes: the owner gets the real farm, a farmless user gets null (-> onboarding)", async () => {
    const mine = await loadDashboard(prisma, { userId: ownerId });
    expect(mine?.farm.id).toBe(realId);
    expect(mine?.dataKind).toBe("real");

    // A signed-in user who owns no farm resolves null (not the demo), so the dashboard
    // layout redirects them to onboarding instead of rendering the seed.
    const theirs = await loadDashboard(prisma, { userId: otherId });
    expect(theirs).toBeNull();
  });
});
