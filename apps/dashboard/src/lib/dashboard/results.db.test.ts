import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadMetersForFarm } from "./load";
import { loadTrackedResults } from "./results";

// Integration test for the tracked-results read edge (Story 4.2, FR-20): groups a
// farm's ACCEPTED recommendations by meter into predicted-vs-realized ResultViews,
// reading "pending" until a bill posts after acceptance. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let realizedPumpId: string; // has a bill that posts after acceptance
let pendingPumpId: string; // only bills before acceptance
let barePumpId: string; // no accepted recs

const ACCEPTED_AT = new Date("2026-03-15T00:00:00.000Z");

async function makePump(name: string, billCloseIso: string): Promise<string> {
  const pump = await prisma.pump.create({
    data: { name, serviceId: name, rateSchedule: "AGC", coverageState: "reconciled", farmId },
  });
  await prisma.billingPeriod.create({
    data: {
      pumpId: pump.id,
      start: new Date(billCloseIso),
      close: new Date(billCloseIso),
      printedTotalCents: 282622,
    },
  });
  return pump.id;
}

function acceptedRec(pumpId: string | null, predictedUsd: number | null): Prisma.RecommendationCreateManyInput {
  const action: Prisma.InputJsonValue = {
    kind: "switch_rate",
    label: "Switch rate",
    ...(pumpId !== null ? { params: { pumpId } } : {}),
  };
  const result: Prisma.InputJsonValue = { followed: true, ...(predictedUsd !== null ? { predictedUsd } : {}) };
  return {
    farmId,
    tool: "rate-optimization",
    situation: `Tracked rec for ${pumpId ?? "fleet"}`,
    action,
    impactUsd: predictedUsd,
    severity: "act",
    status: "done",
    resolvedAt: ACCEPTED_AT,
    result,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Results Farm", isDemo: false } });
  farmId = farm.id;

  realizedPumpId = await makePump("P-REALIZED", "2026-04-10T00:00:00.000Z"); // after acceptance
  pendingPumpId = await makePump("P-PENDING", "2026-02-10T00:00:00.000Z"); // before acceptance
  barePumpId = await makePump("P-BARE", "2026-04-10T00:00:00.000Z");

  await prisma.recommendation.createMany({
    data: [
      acceptedRec(realizedPumpId, 11727.33),
      acceptedRec(pendingPumpId, 5000),
      acceptedRec(null, 999), // fleet-level: no meter, skipped
    ],
  });
  // A still-pending (unaccepted) rec must NOT appear in tracked results.
  await prisma.recommendation.create({
    data: { ...acceptedRec(barePumpId, 100), status: "pending", resolvedAt: null, result: Prisma.JsonNull },
  });
});

afterAll(async () => {
  await db?.cleanup();
});

describe("loadTrackedResults", () => {
  it("realizes the next bill for a meter whose bill posts after acceptance", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    const tracked = await loadTrackedResults(prisma, farmId, meters);
    const v = tracked[realizedPumpId];
    expect(v).toHaveLength(1);
    expect(v?.[0]?.isPending).toBe(false);
    expect(v?.[0]?.actualUsd).toBe(2826.22);
    expect(v?.[0]?.predictedUsd).toBe(11727.33);
  });

  it("reads pending for a meter with no bill after acceptance (the v1 by-design state)", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    const tracked = await loadTrackedResults(prisma, farmId, meters);
    const v = tracked[pendingPumpId];
    expect(v).toHaveLength(1);
    expect(v?.[0]?.isPending).toBe(true);
    expect(v?.[0]?.actualUsd).toBeNull();
    expect(v?.[0]?.predictedUsd).toBe(5000);
  });

  it("skips a fleet-level accepted rec (no meter to surface it on)", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    const tracked = await loadTrackedResults(prisma, farmId, meters);
    const allViews = Object.values(tracked).flat();
    expect(allViews.some((r) => r.situation.includes("fleet"))).toBe(false);
  });

  it("does not surface a meter whose only rec is still pending (unaccepted)", async () => {
    const meters = await loadMetersForFarm(prisma, farmId);
    const tracked = await loadTrackedResults(prisma, farmId, meters);
    expect(tracked[barePumpId]).toBeUndefined();
  });
});
