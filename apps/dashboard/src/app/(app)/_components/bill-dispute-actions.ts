"use server";

// Server Action for the bill-dispute Home card. The farm OWNER taps "Approve and prepare
// dispute packet"; this re-resolves the session itself (a Server Action is an independently
// reachable POST, never trusting a layout gate), routes ownership through the foundation's
// approveAction chokepoint (which asserts Farm.userId === userId on the ACTION's own farmId, so
// a forged id cannot widen access), and — only after approval succeeds — renders and persists
// the immutable PDF dispute packet, links its reportId onto the AgentAction, and marks the
// source bill-audit Recommendation done. It NEVER calls PG&E.
//
// This is its OWN actions file: it does not touch the frozen Agents audit page or its actions.

import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveAction, rejectAction } from "@/lib/agents/approval";
import { en } from "@/copy/en";
import type { ActionResult } from "../actions";
import { readDisputeCandidate, type AuditCandidateRow } from "@/lib/agents/agents/bill-audit/detect";
import { renderAndStoreDisputePacket } from "@/lib/agents/agents/bill-audit/packet";

const t = en.agents.billDispute.card;

/**
 * Approve a proposed bill-dispute action AND prepare its dispute packet. Steps, in order:
 *   1. re-check the session;
 *   2. approveAction (asserts owner on the action's own farm, flips proposed -> approved ->
 *      executed atomically). A non-owner is the only hard refusal; a settled action (already
 *      approved/rejected) is a calm no-op that still re-renders;
 *   3. reconstruct the grounded dispute facts from the action + its source pending bill-audit
 *      Recommendation (the engine-authored numbers), render the PDF packet, and persist it via
 *      the report store (private blob + GeneratedReport, farm-scoped by the store deps);
 *   4. link the new reportId onto the AgentAction and mark the source Recommendation done.
 * The packet is best-effort AFTER approval: if rendering fails the approval still stands (the
 * draft is recorded), and the card shows the calm error so the owner can retry.
 */
export async function approveAndPrepareDisputeAction(
  agentActionId: string,
): Promise<ActionResult<{ reportId: string }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: t.error };
  if (typeof agentActionId !== "string" || agentActionId === "") {
    return { ok: false, error: t.error };
  }

  // Ownership + the proposed->approved->executed transition, all inside the chokepoint.
  const res = await approveAction(prisma, agentActionId, userId);
  if (!res.ok) {
    // forbidden is a real refusal; wrong_state/not_found are settled outcomes (already
    // handled) — re-render cleanly rather than alarm the owner.
    if (res.reason === "forbidden") return { ok: false, error: t.error };
    revalidatePath("/", "layout");
    return { ok: false, error: t.error };
  }

  // Load the approved action + its farm + its source finding to reconstruct the grounded facts.
  const action = await prisma.agentAction.findUnique({
    where: { id: agentActionId },
    select: {
      farmId: true,
      recommendationId: true,
      draftSubject: true,
      draftBody: true,
      recommendation: {
        select: { id: true, action: true, severity: true, status: true },
      },
    },
  });
  if (action === null) return { ok: false, error: t.error };

  // The source bill-audit Recommendation carries the engine-authored figures. It may have been
  // resolved/re-inserted by a later engine sweep; when present we read its numbers, so the
  // packet's dollars are always the engine's. With no readable source we cannot build an honest
  // packet — surface the calm error (the approval stands; the draft is on the action).
  if (action.recommendation === null) return { ok: false, error: t.error };
  const candidate = readDisputeCandidate(action.recommendation as AuditCandidateRow);
  if (candidate === null) return { ok: false, error: t.error };

  // The pump name for the packet header (farm-scoped); fall back to the id if it was deleted.
  const pump = await prisma.pump.findFirst({
    where: { id: candidate.pumpId, farmId: action.farmId },
    select: { name: true },
  });
  const pumpName = pump?.name ?? candidate.pumpId;

  // The approved letter, verbatim. The draft is the contract; if it is somehow missing we
  // cannot render the packet honestly, so surface the calm error.
  if (action.draftSubject === null || action.draftBody === null) {
    return { ok: false, error: t.error };
  }

  try {
    const stored = await renderAndStoreDisputePacket(
      { prisma, farmId: action.farmId, createdById: userId },
      {
        pumpName,
        candidate,
        letter: { subject: action.draftSubject, body: action.draftBody },
      },
    );

    // Link the packet onto the audit row, and mark the source finding done (atomic, farm- and
    // status-scoped, so a re-tap or another tab cannot double-resolve it). Both writes are
    // farm-scoped: the action by its id (we just owned it), the finding by farmId + pending.
    await prisma.agentAction.update({
      where: { id: agentActionId },
      data: { reportId: stored.id },
    });
    if (candidate.recommendationId !== "") {
      await prisma.recommendation.updateMany({
        where: { id: candidate.recommendationId, farmId: action.farmId, status: "pending" },
        data: { status: "done", resolvedAt: new Date() },
      });
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { reportId: stored.id } };
  } catch {
    // Rendering/persisting the packet failed AFTER approval; the approval and draft stand, so
    // the owner can retry. Surface the calm error, never a raw throw.
    revalidatePath("/", "layout");
    return { ok: false, error: t.error };
  }
}

/** Skip a proposed bill-dispute: terminal reject, nothing is filed or prepared. Same gate. */
export async function skipDisputeAction(
  agentActionId: string,
): Promise<ActionResult<null>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: t.error };
  if (typeof agentActionId !== "string" || agentActionId === "") {
    return { ok: false, error: t.error };
  }
  const res = await rejectAction(prisma, agentActionId, userId);
  if (!res.ok && res.reason === "forbidden") return { ok: false, error: t.error };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
