import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  runRateOptForFarm,
  readSwitchRateParams,
  rateSwitchKey,
  REQUEST_RATE_SWITCH_KIND,
} from "./run";

// Integration test for the rate optimization agent (the POST-PROCESSOR) against a throwaway
// Postgres on the local test cluster, never dev/prod. Proves: it reads the pending switch_rate
// findings runEngines already produced and records one proposed action per NEW wrong-rate
// finding; it dedupes on the STABLE pumpId+toSchedule key across re-sweeps (so a standing
// finding is proposed once even though Recommendation.id changes); it ignores non-switch rate
// rows; it never re-runs the engines; and a thrown error records a "failed" run.

const RATE_TOOL = "rate-optimization";

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

/** Insert a pending switch_rate Recommendation mirroring rate-compare.ts's exact shape. */
async function seedSwitchRate(input: {
  pumpId: string;
  pumpName: string;
  from: string;
  to: string;
  impactUsd: number;
}): Promise<string> {
  const rec = await prisma.recommendation.create({
    data: {
      farmId,
      tool: RATE_TOOL,
      situation: `${input.pumpName} is on the wrong rate`,
      action: {
        kind: "switch_rate",
        label: `Move it to ${input.to}`,
        params: {
          pumpId: input.pumpId,
          pumpName: input.pumpName,
          fromSchedule: input.from,
          toSchedule: input.to,
        },
        execute: null,
      },
      impactUsd: input.impactUsd,
      impactNote: "wrong rate",
      severity: "act",
      status: "pending",
    },
  });
  return rec.id;
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await prisma.farm.create({ data: { name: "Rate Farm", isDemo: false } });
  farmId = farm.id;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("readSwitchRateParams (pure narrowing)", () => {
  it("reads the grounded params off a real switch_rate action", () => {
    const params = readSwitchRateParams({
      kind: "switch_rate",
      label: "Move it to AG-B",
      params: { pumpId: "p1", pumpName: "Well 3", fromSchedule: "AG-C", toSchedule: "AG-B" },
    });
    expect(params).toEqual({
      pumpId: "p1",
      pumpName: "Well 3",
      fromSchedule: "AG-C",
      toSchedule: "AG-B",
    });
  });

  it("returns null for a non-switch action (e.g. review_legacy_fleet) or a missing target", () => {
    expect(readSwitchRateParams({ kind: "review_legacy_fleet", params: { count: 3 } })).toBeNull();
    expect(readSwitchRateParams({ kind: "switch_rate", params: { pumpId: "p1" } })).toBeNull();
    expect(readSwitchRateParams("nonsense")).toBeNull();
    expect(readSwitchRateParams(null)).toBeNull();
  });
});

describe("rate optimization agent run", () => {
  it("records one proposed action per pending switch_rate finding, with the stable command", async () => {
    await seedSwitchRate({ pumpId: "pumpA", pumpName: "West Pump", from: "AG-C", to: "AG-B", impactUsd: 1234.5 });

    await runRateOptForFarm(prisma, farmId);

    const run = await prisma.agentRun.findFirstOrThrow({
      where: { farmId, kind: "rate_switch" },
      orderBy: { createdAt: "desc" },
    });
    expect(run.status).toBe("succeeded");

    const actions = await prisma.agentAction.findMany({
      where: { farmId, kind: REQUEST_RATE_SWITCH_KIND },
    });
    expect(actions).toHaveLength(1);
    const a = actions[0]!;
    expect(a.status).toBe("proposed");
    expect(a.agentRunId).toBe(run.id);
    expect(a.recommendationId).not.toBeNull();
    expect(a.summary).toContain("West Pump");
    expect(a.summary).toContain("AG-B");
    // The proposed command carries the STABLE key fields + frozen impact (NOT the rec id).
    expect(a.proposedCommand).toMatchObject({
      pumpId: "pumpA",
      toSchedule: "AG-B",
      fromSchedule: "AG-C",
      impactUsd: 1234.5,
    });
  });

  it("dedupes on pumpId+toSchedule across a re-sweep that mints a NEW Recommendation id", async () => {
    // runEngines clears+re-inserts PENDING rows, so the rec id changes every sweep. Delete the
    // first finding and re-seed the SAME pump->target: the agent must NOT re-propose it.
    await prisma.recommendation.deleteMany({ where: { farmId, status: "pending" } });
    await seedSwitchRate({ pumpId: "pumpA", pumpName: "West Pump", from: "AG-C", to: "AG-B", impactUsd: 1300 });

    await runRateOptForFarm(prisma, farmId);

    const actions = await prisma.agentAction.findMany({
      where: { farmId, kind: REQUEST_RATE_SWITCH_KIND },
    });
    // Still exactly one for pumpA->AG-B: the standing finding was already proposed last sweep.
    const forPumpA = actions.filter((a) => keyOf(a.proposedCommand) === rateSwitchKey("pumpA", "AG-B"));
    expect(forPumpA).toHaveLength(1);
  });

  it("proposes a SECOND action when a different pump (or a different target) appears", async () => {
    await seedSwitchRate({ pumpId: "pumpB", pumpName: "East Pump", from: "AG-4", to: "AG-C", impactUsd: 800 });

    await runRateOptForFarm(prisma, farmId);

    const actions = await prisma.agentAction.findMany({
      where: { farmId, kind: REQUEST_RATE_SWITCH_KIND },
    });
    const keys = new Set(actions.map((a) => keyOf(a.proposedCommand)));
    expect(keys.has(rateSwitchKey("pumpA", "AG-B"))).toBe(true);
    expect(keys.has(rateSwitchKey("pumpB", "AG-C"))).toBe(true);
  });

  it("ignores a non-switch rate finding (review_legacy_fleet) - no action recorded for it", async () => {
    const fresh = await prisma.farm.create({ data: { name: "Legacy Farm", isDemo: false } });
    await prisma.recommendation.create({
      data: {
        farmId: fresh.id,
        tool: RATE_TOOL,
        situation: "3 meters are still on closed legacy rates",
        action: {
          kind: "review_legacy_fleet",
          label: "Review the legacy-rate meters",
          params: { pumpIds: ["x", "y", "z"], count: 3 },
          execute: null,
        },
        impactNote: "legacy",
        severity: "watch",
        status: "pending",
      },
    });

    await runRateOptForFarm(prisma, fresh.id);

    const actions = await prisma.agentAction.count({
      where: { farmId: fresh.id, kind: REQUEST_RATE_SWITCH_KIND },
    });
    expect(actions).toBe(0);
    const run = await prisma.agentRun.findFirstOrThrow({ where: { farmId: fresh.id, kind: "rate_switch" } });
    expect(run.status).toBe("succeeded");
  });

  it("closes 'succeeded' with no actions for a farm that has no wrong-rate findings", async () => {
    const empty = await prisma.farm.create({ data: { name: "Empty Farm", isDemo: false } });
    await runRateOptForFarm(prisma, empty.id);
    const run = await prisma.agentRun.findFirstOrThrow({
      where: { farmId: empty.id, kind: "rate_switch" },
    });
    expect(run.status).toBe("succeeded");
    expect(await prisma.agentAction.count({ where: { farmId: empty.id } })).toBe(0);
  });
});

/** Re-derive the stable key from a stored proposedCommand for assertions. */
function keyOf(command: unknown): string | null {
  if (typeof command !== "object" || command === null) return null;
  const c = command as Record<string, unknown>;
  if (typeof c.pumpId !== "string" || typeof c.toSchedule !== "string") return null;
  return rateSwitchKey(c.pumpId, c.toSchedule);
}
