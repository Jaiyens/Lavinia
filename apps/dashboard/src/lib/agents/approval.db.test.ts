import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { startAgentRun, recordAgentAction } from "./run";
import {
  approveAction,
  rejectAction,
  executeApprovedAction,
  assertFarmOwner,
} from "./approval";

// Integration test for the human-in-the-loop approval gate against a throwaway Postgres on
// the local test cluster, never dev/prod. Proves: approve transitions proposed -> approved
// -> executed (in one call); executeApprovedAction is idempotent (a second call no-ops); a
// non-owner is refused; reject is terminal.

let db: TestDb;
let prisma: PrismaClient;
let ownerId: string;
let strangerId: string;
let farmId: string;

/** Record a fresh proposed action on the owner's farm and return its id. */
async function proposeAction(): Promise<string> {
  const run = await startAgentRun(prisma, { farmId, kind: "bill_dispute", triggeredBy: "cron" });
  const action = await recordAgentAction(prisma, {
    agentRunId: run.id,
    farmId,
    kind: "draft_dispute_email",
    summary: "Draft a dispute email",
  });
  return action.id;
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const owner = await prisma.user.create({ data: { email: "owner@example.com" } });
  const stranger = await prisma.user.create({ data: { email: "stranger@example.com" } });
  ownerId = owner.id;
  strangerId = stranger.id;
  const farm = await prisma.farm.create({
    data: { name: "Owned Farm", isDemo: false, userId: ownerId },
  });
  farmId = farm.id;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("agent action approval", () => {
  it("the owner can approve: proposed -> approved -> executed in one call", async () => {
    const id = await proposeAction();
    const res = await approveAction(prisma, id, ownerId);
    expect(res).toEqual({ ok: true, status: "executed" });
    const row = await prisma.agentAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("executed");
    expect(row.approvedById).toBe(ownerId);
    expect(row.approvedAt).not.toBeNull();
  });

  it("executeApprovedAction is idempotent: a second call is a no-op", async () => {
    const id = await proposeAction();
    // Move it to approved (stamps owner) without executing, then execute twice.
    await prisma.agentAction.update({
      where: { id },
      data: { status: "approved", approvedById: ownerId, approvedAt: new Date() },
    });
    const first = await executeApprovedAction(prisma, id);
    expect(first).toEqual({ ok: true, status: "executed" });
    const second = await executeApprovedAction(prisma, id);
    expect(second).toEqual({ ok: false, reason: "wrong_state" });
    const row = await prisma.agentAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("executed"); // unchanged by the second call
  });

  it("a non-owner is refused (forbidden), and the action stays proposed", async () => {
    const id = await proposeAction();
    const res = await approveAction(prisma, id, strangerId);
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    const row = await prisma.agentAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("proposed"); // never moved
    expect(row.approvedById).toBeNull();
  });

  it("assertFarmOwner accepts the owner and refuses a stranger and a bad id", async () => {
    const id = await proposeAction();
    const ok = await assertFarmOwner(prisma, id, ownerId);
    expect(ok.ok).toBe(true);
    const no = await assertFarmOwner(prisma, id, strangerId);
    expect(no).toEqual({ ok: false, reason: "forbidden" });
    const missing = await assertFarmOwner(prisma, "nope", ownerId);
    expect(missing).toEqual({ ok: false, reason: "not_found" });
  });

  it("reject is terminal: proposed -> rejected, never executes", async () => {
    const id = await proposeAction();
    const res = await rejectAction(prisma, id, ownerId);
    expect(res).toEqual({ ok: true, status: "rejected" });
    const row = await prisma.agentAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("rejected");
    // A later approve of a rejected action is a wrong_state no-op.
    const after = await approveAction(prisma, id, ownerId);
    expect(after).toEqual({ ok: false, reason: "wrong_state" });
  });

  it("approving an already-resolved action is a calm wrong_state no-op", async () => {
    const id = await proposeAction();
    await approveAction(prisma, id, ownerId); // executes
    const again = await approveAction(prisma, id, ownerId);
    expect(again).toEqual({ ok: false, reason: "wrong_state" });
  });
});
