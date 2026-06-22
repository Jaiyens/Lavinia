import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { runBillDisputeForFarm, FILE_BILL_DISPUTE_KIND } from "./run";

// Integration test for the bill-dispute agent's run against a throwaway Postgres on the local
// test cluster (never Neon). Proves: a pending act-severity audit_bill finding above the floor
// yields ONE proposed file_bill_dispute action with the drafted letter; the run closes
// "succeeded"; a no-peak "watch" finding and a below-floor excess are NOT proposed; the agent is
// IDEMPOTENT (a re-run proposes nothing new, even after runEngines re-inserts the finding with a
// NEW id); and the agent runs NO engine (it only reads + records).

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let pumpId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(async () => {
  // A fresh farm + pump per test so the idempotency dedupe set starts empty.
  const farm = await prisma.farm.create({ data: { name: "Dispute Farm", isDemo: false } });
  farmId = farm.id;
  const pump = await prisma.pump.create({ data: { farmId, name: "West Pump 12" } });
  pumpId = pump.id;
});

/** Insert a pending bill-audit recommendation for this farm. Mirrors what billAudit emits. */
async function insertAuditRec(over: {
  severity?: string;
  excessUsd?: number;
  cycleStart?: string;
}): Promise<string> {
  const rec = await prisma.recommendation.create({
    data: {
      farmId,
      tool: "bill-audit",
      situation: "West Pump 12's May bill came in higher than usual.",
      impactUsd: over.excessUsd ?? 600,
      impactNote: "About $600 over a usual month.",
      severity: over.severity ?? "act",
      status: "pending",
      action: {
        kind: "audit_bill",
        label: "Check the May bill",
        params: {
          pumpId,
          cycleStart: over.cycleStart ?? "2026-05-01",
          cycleClose: "2026-05-31",
          totalBillUsd: 1800,
          medianTotalUsd: 1200,
          excessUsd: over.excessUsd ?? 600,
          peakKw: 40,
          medianPeakKw: 39,
        },
        execute: null,
      },
    },
    select: { id: true },
  });
  return rec.id;
}

async function disputeActions() {
  return prisma.agentAction.findMany({
    where: { farmId, kind: FILE_BILL_DISPUTE_KIND },
    orderBy: { createdAt: "asc" },
  });
}

describe("bill-dispute agent run", () => {
  it("proposes ONE dispute for an act-severity audit_bill above the floor, and closes succeeded", async () => {
    const recId = await insertAuditRec({});
    await runBillDisputeForFarm(prisma, farmId);

    const actions = await disputeActions();
    expect(actions).toHaveLength(1);
    const a = actions[0]!;
    expect(a.status).toBe("proposed");
    expect(a.recommendationId).toBe(recId);
    expect(a.draftSubject).toContain("West Pump 12");
    expect(a.draftBody).toContain("West Pump 12");
    // The proposed command carries the stable dedupe facts.
    expect(a.proposedCommand).toMatchObject({ pumpId, cycleStart: "2026-05-01" });
    // The summary names the meter + the dollars.
    expect(a.summary).toContain("West Pump 12");

    const runs = await prisma.agentRun.findMany({ where: { farmId, kind: "bill_dispute" } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("succeeded");
  });

  it("does NOT propose for a watch finding or a below-floor excess", async () => {
    await insertAuditRec({ severity: "watch" });
    await insertAuditRec({ excessUsd: 20, cycleStart: "2026-06-01" });
    await runBillDisputeForFarm(prisma, farmId);
    expect(await disputeActions()).toHaveLength(0);
    // The run still closes succeeded (nothing to do is not a failure).
    const runs = await prisma.agentRun.findMany({ where: { farmId, kind: "bill_dispute" } });
    expect(runs[0]!.status).toBe("succeeded");
  });

  it("is idempotent: a re-run proposes nothing new for the same cycle", async () => {
    await insertAuditRec({});
    await runBillDisputeForFarm(prisma, farmId);
    await runBillDisputeForFarm(prisma, farmId);
    expect(await disputeActions()).toHaveLength(1);
    // Two runs recorded, both succeeded; only one proposal.
    const runs = await prisma.agentRun.findMany({ where: { farmId, kind: "bill_dispute" } });
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === "succeeded")).toBe(true);
  });

  it("dedupes on (pumpId, cycleStart) even when runEngines re-inserts the finding with a NEW id", async () => {
    const firstId = await insertAuditRec({});
    await runBillDisputeForFarm(prisma, farmId);
    // Simulate a daily engine sweep: the old pending rec is cleared and re-inserted with a new id.
    await prisma.recommendation.delete({ where: { id: firstId } });
    const secondId = await insertAuditRec({});
    expect(secondId).not.toBe(firstId);

    await runBillDisputeForFarm(prisma, farmId);
    // Still one proposal: the identity (pump + cycle), not the row id, is the dedupe key.
    const actions = await disputeActions();
    expect(actions).toHaveLength(1);
  });

  it("proposes a new dispute for a DIFFERENT cycle", async () => {
    await insertAuditRec({ cycleStart: "2026-05-01" });
    await runBillDisputeForFarm(prisma, farmId);
    await insertAuditRec({ cycleStart: "2026-08-01" });
    await runBillDisputeForFarm(prisma, farmId);
    expect(await disputeActions()).toHaveLength(2);
  });

  it("does not re-propose a cycle the owner already SKIPPED (rejected)", async () => {
    await insertAuditRec({});
    await runBillDisputeForFarm(prisma, farmId);
    const [a] = await disputeActions();
    await prisma.agentAction.update({ where: { id: a!.id }, data: { status: "rejected" } });
    // A later sweep must not pester the owner with the skipped dispute again.
    await runBillDisputeForFarm(prisma, farmId);
    expect(await disputeActions()).toHaveLength(1);
  });
});
