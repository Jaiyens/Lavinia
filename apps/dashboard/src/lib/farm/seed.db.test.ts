import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedSampleFarm } from "../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { RecommendationAction } from "@/lib/recommendations/types";

// Integration test: actually run the seed through Prisma and confirm the farm
// loads and every relation resolves. Runs against a throwaway Postgres database
// on the local test cluster (src/test/pg-harness.ts), so this never touches the
// dev/prod db.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("seedSampleFarm", () => {
  it("loads the farm and all relations resolve", async () => {
    const farm = await seedSampleFarm(prisma);

    expect(farm.name).toBeTruthy();
    expect(farm.people).toHaveLength(1);
    expect(farm.people[0]?.role).toBe("owner");
    expect(farm.connections.some((c) => c.type === "pge_smd")).toBe(true);
    expect(farm.pumps.length).toBeGreaterThanOrEqual(6);
    expect(farm.blocks.length).toBeGreaterThan(0);

    // Each block resolves to its crop and to at least one serving pump.
    for (const block of farm.blocks) {
      expect(block.crop).not.toBeNull();
      expect(block.pumps.length).toBeGreaterThan(0);
    }
    // Each pump resolves to at least one block, on an AG-B/AG-C schedule.
    for (const pump of farm.pumps) {
      expect(pump.blocks.length).toBeGreaterThan(0);
      expect(["AG-B", "AG-C"]).toContain(pump.rateSchedule);
    }
    const schedules = new Set(farm.pumps.map((p) => p.rateSchedule));
    expect(schedules.has("AG-B") && schedules.has("AG-C")).toBe(true);

    // The m-n join resolves both ways: a pump serving two blocks shows up on both.
    const shared = farm.pumps.find((p) => p.blocks.length > 1);
    expect(shared).toBeDefined();
    for (const link of shared?.blocks ?? []) {
      const block = farm.blocks.find((b) => b.id === link.id);
      expect(block?.pumps.some((p) => p.id === shared?.id)).toBe(true);
    }
  }, 60_000);

  it("re-seeds idempotently (one farm, not duplicated)", async () => {
    await seedSampleFarm(prisma);
    await seedSampleFarm(prisma);
    expect(await prisma.farm.count()).toBe(1);
    // Crops are shared and upserted, not duplicated, across re-seeds.
    expect(await prisma.crop.count()).toBe(2);
  }, 60_000);

  it("round-trips a Recommendation carrying the executable-action hook", async () => {
    const farm = await prisma.farm.findFirstOrThrow();
    const action: RecommendationAction = {
      kind: "stagger_pumps",
      label: "Hold the west set 2 hours so two pumps do not peak together",
      params: { holdHours: 2 },
      execute: {
        target: "pump_controller",
        operation: "delay_start",
        payload: { minutes: 120 },
        dryRun: true,
      },
    };
    const created = await prisma.recommendation.create({
      data: {
        farmId: farm.id,
        tool: "pump-timing",
        situation: "Two pumps are set to start in the same window.",
        action: action as Prisma.InputJsonValue,
        severity: "act",
        impactUsd: 1840,
      },
    });

    const read = await prisma.recommendation.findUniqueOrThrow({
      where: { id: created.id },
    });
    const storedAction = read.action as RecommendationAction;
    expect(storedAction.kind).toBe("stagger_pumps");
    expect(storedAction.execute?.operation).toBe("delay_start");
    expect(storedAction.execute?.payload?.minutes).toBe(120);
    expect(read.status).toBe("pending");
  }, 60_000);
});
