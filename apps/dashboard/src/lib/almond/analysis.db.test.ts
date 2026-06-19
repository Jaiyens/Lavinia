import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { runEngines } from "@/lib/recommendations/run";
import { seedBatthFarm } from "../../../prisma/batth-farm";
import { analyzeFarm } from "./analysis";

// Integration test for analyzeFarm over the REAL Batth seed. Seeds the representative farm, runs
// every recommendation engine, loads the same meters + findings the dashboard reads, and asserts
// the enriched analysis matches the verified ground truth (.night/GROUND-TRUTH.md). This is what
// proves the findings.ts rate-extraction fix (toSchedule) actually populates `opportunities` and
// that topFinding/rankingsByCost agree with the seed. Throwaway Postgres; never dev.db.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const seeded = await seedBatthFarm(prisma);
  farmId = seeded.id;
  await runEngines(prisma, farmId);
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("analyzeFarm over the real Batth seed", () => {
  it("matches the verified ground truth: topFinding, opportunities, and rankingsByCost", async () => {
    const [meters, findings] = await Promise.all([
      loadMetersForFarm(prisma, farmId),
      loadFindings(prisma, farmId),
    ]);
    const a = analyzeFarm(meters, findings);

    // topFinding (the cover hero / ACT card) is the AG-B -> AG-C switch on Westside Pump 17,
    // ~$61,417.76 = 6,141,776 cents, tool rate-optimization. (The findings.ts fix is what makes
    // suggestedRate read "AG-C" off params.toSchedule instead of null.)
    expect(a.topFinding?.meterName).toBe("Westside Pump 17");
    expect(a.topFinding?.suggestedRate).toBe("AG-C");
    expect(a.topFinding?.impactCents).toBeGreaterThanOrEqual(6_141_776 - 200);
    expect(a.topFinding?.impactCents).toBeLessThanOrEqual(6_141_776 + 200);

    // The rate-switch Opportunities table populates to exactly 4 (it was EMPTY before the fix),
    // led by Westside Pump 17.
    expect(a.opportunities).toHaveLength(4);
    expect(a.opportunities[0]?.name).toBe("Westside Pump 17");
    expect(a.opportunities[0]?.flags.suggestedRate).toBe("AG-C");
    // Every opportunity is a real rate switch with a positive estimated saving.
    for (const opp of a.opportunities) {
      expect(opp.flags.misRated).toBe(true);
      expect(opp.flags.suggestedRate).not.toBeNull();
      expect(opp.flags.estAnnualSavingsCents).toBeGreaterThan(0);
    }

    // The most expensive meter by latest reconciled bill is Westside Pump 17.
    expect(a.rankingsByCost[0]?.name).toBe("Westside Pump 17");
  });
});
