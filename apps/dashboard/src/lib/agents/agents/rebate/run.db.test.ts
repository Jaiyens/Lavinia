import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { INCENTIVE_TOOL } from "@/lib/recommendations/run-incentives";
import { getAgent } from "../../registry";
import { runRebateForFarm } from "./run";
// Side-effect import registers the agent under kind "rebate".
import "./run";

// Integration test for the registered rebate agent: it opens a run, persists honest-blank
// 'rebate' findings via runIncentives, records one "flag_incentive" audit action per match
// (each linked to its Recommendation), and closes the run "succeeded". Throwaway Postgres.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Rebate Agent Farm", isDemo: false } });
  farmId = farm.id;

  // One bare AG-C meter -> three curtailment-program matches.
  await prisma.pump.create({
    data: {
      name: "P031",
      serviceId: "SA-AGC",
      rateSchedule: "AGC Ag35+ kW High Use",
      isSolar: false,
      coverageState: "reconciled",
      farmId,
    },
  });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("rebate agent registration", () => {
  it("registers under kind 'rebate', monthly cron", () => {
    const agent = getAgent("rebate");
    expect(agent).toBeDefined();
    expect(agent?.kind).toBe("rebate");
    expect(agent?.trigger).toBe("cron");
    expect(agent?.cadence).toBe("monthly");
    expect(agent?.label.length).toBeGreaterThan(0);
  });
});

describe("runRebateForFarm", () => {
  it("opens a run, persists matches, records one action each, closes 'succeeded'", async () => {
    await runRebateForFarm(prisma, farmId);

    const run = await prisma.agentRun.findFirstOrThrow({
      where: { farmId, kind: "rebate" },
      orderBy: { createdAt: "desc" },
    });
    expect(run.status).toBe("succeeded");
    expect(run.completedAt).not.toBeNull();
    expect(run.triggeredBy).toBe("cron");

    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: INCENTIVE_TOOL, status: "pending" },
    });
    expect(recs).toHaveLength(3);

    const actions = await prisma.agentAction.findMany({
      where: { farmId, agentRunId: run.id },
    });
    expect(actions).toHaveLength(3);
    for (const a of actions) {
      expect(a.kind).toBe("flag_incentive");
      expect(a.status).toBe("proposed");
      expect(a.recommendationId).not.toBeNull();
      expect(a.summary.length).toBeGreaterThan(0);
    }
    // Every action links a persisted 'rebate' recommendation.
    const recIds = new Set(recs.map((r) => r.id));
    for (const a of actions) {
      expect(recIds.has(a.recommendationId ?? "")).toBe(true);
    }
  });

  it("is idempotent across runs (the runner clears + re-inserts its own tool key)", async () => {
    await runRebateForFarm(prisma, farmId);
    await runRebateForFarm(prisma, farmId);
    expect(
      await prisma.recommendation.count({ where: { farmId, tool: INCENTIVE_TOOL, status: "pending" } }),
    ).toBe(3);
  });
});
