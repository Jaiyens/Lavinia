import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { startAgentRun, recordAgentAction, completeAgentRun } from "./run";

// Integration test for the agent-ledger DB edge against a throwaway Postgres database on the
// local test cluster (src/test/pg-harness.ts), never the dev/prod Neon db. Proves the writes
// are farmId-scoped and append-only, and that deleting a Recommendation SET NULLs the
// AgentAction.recommendationId so the audit row SURVIVES (the immutability guarantee).

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await prisma.farm.create({ data: { name: "Agent Farm", isDemo: false } });
  farmId = farm.id;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("agent ledger DB edge", () => {
  it("startAgentRun writes a farmId-scoped run in 'running'", async () => {
    const run = await startAgentRun(prisma, { farmId, kind: "refresh", triggeredBy: "cron" });
    const row = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(row.farmId).toBe(farmId);
    expect(row.kind).toBe("refresh");
    expect(row.status).toBe("running");
    expect(row.triggeredBy).toBe("cron");
    expect(row.completedAt).toBeNull();
  });

  it("recordAgentAction writes a farmId-scoped 'proposed' action under the run", async () => {
    const run = await startAgentRun(prisma, { farmId, kind: "bill_dispute", triggeredBy: "cron" });
    const action = await recordAgentAction(prisma, {
      agentRunId: run.id,
      farmId,
      kind: "draft_dispute_email",
      summary: "Draft a dispute for the May overcharge",
      proposedCommand: { kind: "dispute", amountCents: 1234 },
      draftSubject: "Billing dispute",
      draftBody: "We believe the May bill is overstated.",
    });
    const row = await prisma.agentAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(row.farmId).toBe(farmId);
    expect(row.agentRunId).toBe(run.id);
    expect(row.status).toBe("proposed");
    expect(row.summary).toContain("dispute");
    expect(row.draftSubject).toBe("Billing dispute");
    expect(row.recommendationId).toBeNull();
    expect(row.approvedById).toBeNull();
  });

  it("completeAgentRun stamps the terminal status, note, and completedAt", async () => {
    const run = await startAgentRun(prisma, { farmId, kind: "refresh", triggeredBy: "cron" });
    await completeAgentRun(prisma, run.id, { status: "failed", note: "PG&E sign-in expired" });
    const row = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(row.status).toBe("failed");
    expect(row.note).toBe("PG&E sign-in expired");
    expect(row.completedAt).not.toBeNull();
  });

  it("deleting a Recommendation SET NULLs the action's recommendationId (audit row survives)", async () => {
    const rec = await prisma.recommendation.create({
      data: {
        farmId,
        tool: "bill-audit",
        situation: "A cycle looks overstated",
        action: { kind: "review_bill", label: "Review it" },
        severity: "act",
        status: "pending",
      },
    });
    const run = await startAgentRun(prisma, { farmId, kind: "bill_dispute", triggeredBy: "cron" });
    const action = await recordAgentAction(prisma, {
      agentRunId: run.id,
      farmId,
      recommendationId: rec.id,
      kind: "draft_dispute_email",
      summary: "Dispute the overstated cycle",
    });

    // Sanity: the link is set.
    let row = await prisma.agentAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(row.recommendationId).toBe(rec.id);

    // Deleting the finding must NOT cascade away the audit row; it nulls the link.
    await prisma.recommendation.delete({ where: { id: rec.id } });
    row = await prisma.agentAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(row.recommendationId).toBeNull();
    expect(row.summary).toContain("Dispute"); // the audit row still records what was done
  });

  it("deleting the farm cascades its runs and actions away", async () => {
    const farm = await prisma.farm.create({ data: { name: "Throwaway", isDemo: false } });
    const run = await startAgentRun(prisma, {
      farmId: farm.id,
      kind: "refresh",
      triggeredBy: "cron",
    });
    await recordAgentAction(prisma, {
      agentRunId: run.id,
      farmId: farm.id,
      kind: "noop",
      summary: "nothing",
    });
    await prisma.farm.delete({ where: { id: farm.id } });
    expect(await prisma.agentRun.count({ where: { farmId: farm.id } })).toBe(0);
    expect(await prisma.agentAction.count({ where: { farmId: farm.id } })).toBe(0);
  });
});
