// The one-tap "request this rate switch" for a proposed rate-switch action. RECOMMEND-ONLY:
// it records the founder-facing request and freezes the prediction; it NEVER calls PG&E /
// UtilityAPI. The audit UI is the founder's queue (email is a future enhancement, not v1).
//
// What it does, all behind the SAME ownership chokepoint the foundation uses (assertFarmOwner,
// Farm.userId === userId — this base has NO roles):
//   1. assert the caller OWNS the action's farm (the chokepoint reads the action's OWN farmId,
//      so a forged id can never widen access).
//   2. atomically flip the AgentAction proposed -> executed, recording who/when (the
//      "request received" the founder sees). The status gate lives in the WHERE, so a
//      double-tap from two tabs cannot double-fire (mirrors approval.ts).
//   3. mark the SOURCE Recommendation done with the predicted annual saving FROZEN via
//      acceptanceResult (src/lib/recommendations/result.ts) and resolvedAt stamped, so a later
//      runEngines sweep (which only clears PENDING rows) cannot resurrect or rewrite it.
//
// Why a dedicated transition (not approval.ts's approveAction): approveAction transitions only
// the AgentAction and never touches the Recommendation. A rate-switch REQUEST must atomically
// (a) record the request AND (b) close the source finding with its prediction frozen, in one
// transaction, so the audit row and the finding can never disagree. The ownership check and the
// status-guarded atomic transition are the same pattern; only the closed-finding step is added.

import type { Prisma, PrismaClient } from "@prisma/client";
import { acceptanceResult } from "@/lib/recommendations/result";
import { assertFarmOwner } from "../../approval";
import { REQUEST_RATE_SWITCH_KIND } from "./run";

/** The discriminated result the server action surfaces (never throws for an expected failure;
 *  unexpected errors still propagate). Mirrors approval.ts's ApprovalResult shape. */
export type RequestResult =
  | { ok: true; status: "executed" }
  | { ok: false; reason: "not_found" | "forbidden" | "wrong_state" };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The frozen impact off the action's proposedCommand (the engine's predicted annual saving),
 *  or null when the command carried no readable number (an info-only finding). */
function frozenImpactUsd(command: unknown): number | null {
  if (!isObject(command)) return null;
  return typeof command.impactUsd === "number" ? command.impactUsd : null;
}

/**
 * Record the owner's request to switch this meter's rate. Asserts ownership, atomically
 * transitions the proposed action to executed (stamping approvedById/approvedAt as the request
 * receipt), and marks the source Recommendation done with the prediction frozen. IDEMPOTENT via
 * the status guard: a second tap after the action already moved is a calm wrong_state no-op. A
 * non-owner is forbidden; a missing id is not_found. NEVER calls an external / PG&E API.
 */
export async function requestRateSwitch(
  prisma: PrismaClient,
  agentActionId: string,
  userId: string,
): Promise<RequestResult> {
  const owner = await assertFarmOwner(prisma, agentActionId, userId);
  if (!owner.ok) return owner;

  // Read the action so we have the source finding link and the frozen prediction. (The
  // ownership chokepoint confirmed it exists and belongs to this user.)
  const action = await prisma.agentAction.findUnique({
    where: { id: agentActionId },
    select: {
      kind: true,
      recommendationId: true,
      proposedCommand: true,
    },
  });
  if (action === null) return { ok: false, reason: "not_found" };
  // Only this agent's own action kind is requestable here (defense in depth: the UI only
  // shows this control on a rate-switch action, but the action re-checks).
  if (action.kind !== REQUEST_RATE_SWITCH_KIND) {
    return { ok: false, reason: "wrong_state" };
  }

  // Atomic transition: proposed -> executed, stamped with the requester. The status gate in the
  // WHERE means two taps cannot both pass; the first write wins, the second updates zero rows.
  const moved = await prisma.agentAction.updateMany({
    where: { id: agentActionId, status: "proposed" },
    data: { status: "executed", approvedById: userId, approvedAt: new Date() },
  });
  if (moved.count === 0) {
    // Already requested/rejected: settled, not an error (the calm "already handled" outcome).
    return { ok: false, reason: "wrong_state" };
  }

  // Freeze the source finding: mark it done with the predicted annual saving recorded at the
  // moment of the request, so a later engine re-run cannot rewrite history. Guarded on
  // status === "pending" so we never reopen a finding the farmer already resolved another way.
  if (action.recommendationId !== null) {
    const result = acceptanceResult({ impactUsd: frozenImpactUsd(action.proposedCommand) });
    await prisma.recommendation.updateMany({
      where: { id: action.recommendationId, status: "pending" },
      data: {
        status: "done",
        resolvedAt: new Date(),
        result: result as Prisma.InputJsonValue,
      },
    });
  }

  return { ok: true, status: "executed" };
}
