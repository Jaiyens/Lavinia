import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadRecDetail } from "./rec-detail-data";

// Regression for the legacy cross-tenant IDOR: loadRecDetail used to read a recommendation by
// bare id (prisma.recommendation.findUnique({ where: { id } })) and then second-hop into that
// rec's pump (account number, ranches, billing) - all reachable unauthenticated through the
// public /dashboard/pump-timing/rec/[recId] route. It is now farm-scoped: it returns a rec only
// for the caller's OWN farm, and the pump load is scoped too so it cannot pivot into another
// farm's meter. Throwaway Postgres on the local test cluster; never dev.db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

describe("loadRecDetail is farm-scoped", () => {
  it("returns the rec for its own farm and null for any other farm", async () => {
    const farmA = await prisma.farm.create({ data: { name: "Farm A" } });
    const farmB = await prisma.farm.create({ data: { name: "Farm B" } });
    const pumpA = await prisma.pump.create({ data: { farmId: farmA.id, name: "A Pump 1" } });
    const recA = await prisma.recommendation.create({
      data: {
        farmId: farmA.id,
        tool: "pump-timing",
        situation: "A's private finding",
        action: { params: { pumpId: pumpA.id } },
        severity: "act",
        status: "pending",
      },
    });

    // Same farm: the rec and its (farm-scoped) pump resolve.
    const own = await loadRecDetail(prisma, recA.id, farmA.id);
    expect(own?.rec.id).toBe(recA.id);
    expect(own?.pump?.id).toBe(pumpA.id);

    // Other farm: the id is real but not theirs -> null. This is exactly the leak the old
    // findUnique-by-bare-id allowed.
    const cross = await loadRecDetail(prisma, recA.id, farmB.id);
    expect(cross).toBeNull();
  });

  it("never second-hops into another farm's pump, even when a rec points at one", async () => {
    const farmA = await prisma.farm.create({ data: { name: "Farm A2" } });
    const farmB = await prisma.farm.create({ data: { name: "Farm B2" } });
    const pumpB = await prisma.pump.create({ data: { farmId: farmB.id, name: "B Pump" } });
    // A rec on farm A whose params reference farm B's meter (a crafted/stale id).
    const recA = await prisma.recommendation.create({
      data: {
        farmId: farmA.id,
        tool: "pump-timing",
        situation: "A finding pointing at B's meter",
        action: { params: { pumpId: pumpB.id } },
        severity: "act",
        status: "pending",
      },
    });

    const own = await loadRecDetail(prisma, recA.id, farmA.id);
    expect(own?.rec.id).toBe(recA.id);
    // The pump load is farm-scoped, so B's meter never leaks through A's rec.
    expect(own?.pump).toBeNull();
  });
});
