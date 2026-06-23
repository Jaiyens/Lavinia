// The human-in-the-loop approval gate for a recorded agent action. A v1 agent never acts
// on its own: it RECORDS a "proposed" action (run.ts) that the farm OWNER must approve
// here before anything executes. Three operations, all routed through ONE ownership
// chokepoint (assertFarmOwner) that hits the DB, so a future role system is a one-function
// swap (this base has NO roles — authorization is FARM OWNERSHIP, Farm.userId === userId):
//
//   approveAction  proposed -> approved (stamp who/when), then executeApprovedAction
//   rejectAction   proposed -> rejected (terminal)
//   executeApprovedAction  approved -> executed | failed (IDEMPOTENT; a second call no-ops)
//
// Every status transition is an atomic updateMany guarded on the current status in the
// WHERE (mirroring resolveFinding's concurrency pattern), so a double-tap from two tabs
// cannot double-fire. v1 execution is RECORD-AND-HAND-OFF only: it transitions the row and
// must NOT call any external / PG&E API.

import type { PrismaClient } from "@prisma/client";

/** The discriminated result the server actions surface (never throws for an expected
 *  failure like a stale id or a non-owner; unexpected errors still propagate). */
export type ApprovalResult =
  | { ok: true; status: "approved" | "rejected" | "executed" | "failed" }
  | { ok: false; reason: "not_found" | "forbidden" | "wrong_state" };

/**
 * The SINGLE authorization chokepoint. Asserts the user OWNS the farm that the given
 * action belongs to, scoped in the DB query itself (Farm.userId === userId). Returns the
 * action's farmId and current status when the caller owns it, or a refusal reason. Because
 * this base has no role system, "approval rights" == farm ownership; a later role system
 * replaces ONLY the body of this function.
 *
 * The query joins through the action's farm so a forged farmId on the client can never
 * widen access: the action's OWN farmId is read from the row, and ownership is checked
 * against the farm's userId in the same query.
 */
export async function assertFarmOwner(
  prisma: PrismaClient,
  agentActionId: string,
  userId: string,
): Promise<
  | { ok: true; farmId: string; status: string }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const action = await prisma.agentAction.findUnique({
    where: { id: agentActionId },
    select: { farmId: true, status: true, farm: { select: { userId: true } } },
  });
  if (action === null) return { ok: false, reason: "not_found" };
  // Ownership: the farm must belong to this user. A null farm owner (a demo/unowned farm)
  // is never approvable by anyone.
  if (action.farm.userId === null || action.farm.userId !== userId) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, farmId: action.farmId, status: action.status };
}

/**
 * Approve a proposed action: the owner OKs it, then it executes. Asserts ownership through
 * the chokepoint, transitions proposed -> approved atomically (stamping approvedById /
 * approvedAt in the SAME guarded write so a double-tap cannot double-stamp), then hands off
 * to executeApprovedAction. A non-owner is refused; an already-resolved action is a
 * wrong_state no-op (the calm "already handled" outcome, not an error).
 */
export async function approveAction(
  prisma: PrismaClient,
  agentActionId: string,
  userId: string,
): Promise<ApprovalResult> {
  const owner = await assertFarmOwner(prisma, agentActionId, userId);
  if (!owner.ok) return owner;

  // Atomic transition: the proposed-status gate lives in the WHERE, so two approvals of the
  // same action (two tabs) cannot both pass a separate check — the first write wins and the
  // second updates zero rows.
  const moved = await prisma.agentAction.updateMany({
    where: { id: agentActionId, status: "proposed" },
    data: { status: "approved", approvedById: userId, approvedAt: new Date() },
  });
  if (moved.count === 0) {
    // Someone already approved/rejected it (or it was never proposed): settled, not an error.
    return { ok: false, reason: "wrong_state" };
  }

  // Execute now that it is approved. Idempotent and self-contained: even if the owner taps
  // Approve twice, only the first execute transitions the row.
  return executeApprovedAction(prisma, agentActionId);
}

/**
 * Reject a proposed action: terminal, no execution. Asserts ownership, then transitions
 * proposed -> rejected atomically. An already-resolved action is a wrong_state no-op.
 */
export async function rejectAction(
  prisma: PrismaClient,
  agentActionId: string,
  userId: string,
): Promise<ApprovalResult> {
  const owner = await assertFarmOwner(prisma, agentActionId, userId);
  if (!owner.ok) return owner;

  const moved = await prisma.agentAction.updateMany({
    where: { id: agentActionId, status: "proposed" },
    data: { status: "rejected" },
  });
  if (moved.count === 0) return { ok: false, reason: "wrong_state" };
  return { ok: true, status: "rejected" };
}

/**
 * Execute an approved action. IDEMPOTENT: it transitions ONLY from "approved" to "executed"
 * (the atomic updateMany guards on status === "approved"), so a second call after the row
 * is already "executed" updates zero rows and is a no-op. v1 is RECORD-AND-HAND-OFF: it
 * does NOT call any external / PG&E API — it merely marks the recorded action executed so a
 * human (or a later release) carries out the real-world step. On an unexpected error it
 * transitions "approved" -> "failed" (again guarded) and surfaces the failure, never
 * leaving the row stuck in "approved".
 *
 * No ownership check here: this is only reachable from approveAction (which already
 * asserted ownership) or an explicit retry by an already-authorized caller; the status
 * guard is what makes it safe to call again.
 */
export async function executeApprovedAction(
  prisma: PrismaClient,
  agentActionId: string,
): Promise<ApprovalResult> {
  try {
    // v1 hand-off: there is no external side effect to perform. A feature agent that needs
    // one would add it HERE, before the transition, and still keep the transition atomic.
    const moved = await prisma.agentAction.updateMany({
      where: { id: agentActionId, status: "approved" },
      data: { status: "executed" },
    });
    if (moved.count === 0) {
      // Already executed (or never approved): a second tap is a no-op, reported as settled.
      return { ok: false, reason: "wrong_state" };
    }
    return { ok: true, status: "executed" };
  } catch {
    // An unexpected failure: mark it failed (guarded so we only move it out of "approved"),
    // never leave it stuck mid-flight.
    await prisma.agentAction.updateMany({
      where: { id: agentActionId, status: "approved" },
      data: { status: "failed" },
    });
    return { ok: true, status: "failed" };
  }
}
