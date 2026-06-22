import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { startAgentRun, recordAgentAction } from "../../run";
import { requestRateSwitch } from "./switch-request";
import { REQUEST_RATE_SWITCH_KIND, type RateSwitchCommand } from "./run";

// Integration test for the one-tap rate-switch request against a throwaway Postgres on the local
// test cluster, never dev/prod. Proves: the OWNER's request flips the action proposed ->
// executed AND freezes the source Recommendation done with the prediction recorded; it is
// idempotent (a second tap is a wrong_state no-op); a NON-OWNER is forbidden and nothing moves;
// and it NEVER reopens a finding the farmer already resolved.

const RATE_TOOL = "rate-optimization";

let db: TestDb;
let prisma: PrismaClient;
let ownerId: string;
let strangerId: string;
let farmId: string;

/** Seed a pending switch_rate finding + its proposed rate-switch action; return both ids. */
async function proposeRateSwitch(input: {
  impactUsd: number | null;
}): Promise<{ actionId: string; recId: string }> {
  const rec = await prisma.recommendation.create({
    data: {
      farmId,
      tool: RATE_TOOL,
      situation: "West Pump is on the wrong rate",
      action: {
        kind: "switch_rate",
        label: "Move it to AG-B",
        params: { pumpId: "pumpA", pumpName: "West Pump", fromSchedule: "AG-C", toSchedule: "AG-B" },
        execute: null,
      },
      impactUsd: input.impactUsd,
      impactNote: "wrong rate",
      severity: "act",
      status: "pending",
    },
  });
  const run = await startAgentRun(prisma, { farmId, kind: "rate_switch", triggeredBy: "cron" });
  const command: RateSwitchCommand = {
    pumpId: "pumpA",
    toSchedule: "AG-B",
    fromSchedule: "AG-C",
    impactUsd: input.impactUsd,
  };
  const action = await recordAgentAction(prisma, {
    agentRunId: run.id,
    farmId,
    recommendationId: rec.id,
    kind: REQUEST_RATE_SWITCH_KIND,
    summary: "West Pump is on AG-C. Moving it to AG-B saves about $1,234 a year.",
    proposedCommand: command,
  });
  return { actionId: action.id, recId: rec.id };
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const owner = await prisma.user.create({ data: { email: "rate-owner@example.com" } });
  const stranger = await prisma.user.create({ data: { email: "rate-stranger@example.com" } });
  ownerId = owner.id;
  strangerId = stranger.id;
  const farm = await prisma.farm.create({
    data: { name: "Owned Rate Farm", isDemo: false, userId: ownerId },
  });
  farmId = farm.id;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("requestRateSwitch", () => {
  it("the owner's request flips the action to executed and freezes the source finding done", async () => {
    const { actionId, recId } = await proposeRateSwitch({ impactUsd: 1234.5 });

    const res = await requestRateSwitch(prisma, actionId, ownerId);
    expect(res).toEqual({ ok: true, status: "executed" });

    const action = await prisma.agentAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("executed");
    expect(action.approvedById).toBe(ownerId);
    expect(action.approvedAt).not.toBeNull();

    const rec = await prisma.recommendation.findUniqueOrThrow({ where: { id: recId } });
    expect(rec.status).toBe("done");
    expect(rec.resolvedAt).not.toBeNull();
    // acceptanceResult freezes the predicted dollars (rounded to the cent) and marks followed.
    expect(rec.result).toMatchObject({ followed: true, predictedUsd: 1234.5 });
  });

  it("is idempotent: a second tap is a calm wrong_state no-op", async () => {
    const { actionId } = await proposeRateSwitch({ impactUsd: 500 });
    const first = await requestRateSwitch(prisma, actionId, ownerId);
    expect(first).toEqual({ ok: true, status: "executed" });
    const second = await requestRateSwitch(prisma, actionId, ownerId);
    expect(second).toEqual({ ok: false, reason: "wrong_state" });
    const action = await prisma.agentAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("executed"); // unchanged by the second call
  });

  it("a non-owner is forbidden and nothing moves", async () => {
    const { actionId, recId } = await proposeRateSwitch({ impactUsd: 700 });
    const res = await requestRateSwitch(prisma, actionId, strangerId);
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    const action = await prisma.agentAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("proposed");
    const rec = await prisma.recommendation.findUniqueOrThrow({ where: { id: recId } });
    expect(rec.status).toBe("pending"); // never closed
  });

  it("a missing action id is not_found", async () => {
    const res = await requestRateSwitch(prisma, "does-not-exist", ownerId);
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("an info-only finding (no impact) freezes done with no predicted dollars", async () => {
    const { actionId, recId } = await proposeRateSwitch({ impactUsd: null });
    const res = await requestRateSwitch(prisma, actionId, ownerId);
    expect(res).toEqual({ ok: true, status: "executed" });
    const rec = await prisma.recommendation.findUniqueOrThrow({ where: { id: recId } });
    expect(rec.status).toBe("done");
    expect(rec.result).toMatchObject({ followed: true });
    expect((rec.result as { predictedUsd?: number }).predictedUsd).toBeUndefined();
  });

  it("does not reopen a finding the farmer already resolved another way", async () => {
    const { actionId, recId } = await proposeRateSwitch({ impactUsd: 900 });
    // Farmer dismissed the finding before requesting the switch.
    await prisma.recommendation.update({ where: { id: recId }, data: { status: "dismissed" } });
    const res = await requestRateSwitch(prisma, actionId, ownerId);
    // The action still records the request (executed), but the rec stays dismissed (the
    // pending-guard on the rec update means it is not flipped to done).
    expect(res).toEqual({ ok: true, status: "executed" });
    const rec = await prisma.recommendation.findUniqueOrThrow({ where: { id: recId } });
    expect(rec.status).toBe("dismissed");
  });
});
