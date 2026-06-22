"use server";

// Server Actions for the Agents audit area. The farm OWNER approves or rejects an action an
// agent proposed. Every action re-resolves the userId itself (a Server Action is an
// independently reachable POST, so it never trusts a layout gate) and routes the ownership
// check through the approval.ts chokepoint on the ACTION's OWN farmId — the client supplies
// only the action id, never a farmId, so a forged id cannot widen access. Returns the
// discriminated ActionResult instead of throwing for an expected failure (a stale id, a
// non-owner), mirroring resolveFinding.

import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveAction, rejectAction } from "@/lib/agents/approval";
import { en } from "@/copy/en";
import type { ActionResult } from "../../actions";

/** Approve a proposed agent action: the owner OKs it and it executes (record-and-hand-off in
 *  v1). Re-checks the session, asserts ownership via the chokepoint, delegates to
 *  approval.ts, then revalidates the audit page so the card re-renders in its new state. */
export async function approveAgentActionAction(
  agentActionId: string,
): Promise<ActionResult<null>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: en.agents.actionError };
  if (typeof agentActionId !== "string" || agentActionId === "") {
    return { ok: false, error: en.agents.actionError };
  }
  // Ownership is asserted INSIDE approveAction (the single chokepoint) against the action's
  // own farmId, so a forged id is refused there, not here.
  const res = await approveAction(prisma, agentActionId, userId);
  // A non-owner (forbidden) is the only hard refusal; not_found / wrong_state are settled
  // outcomes (already handled, or never existed) and re-render cleanly.
  if (!res.ok && res.reason === "forbidden") {
    return { ok: false, error: en.agents.actionError };
  }
  revalidatePath("/agents");
  return { ok: true, data: null };
}

/** Reject (skip) a proposed agent action: terminal, nothing executes. Same gate as approve. */
export async function rejectAgentActionAction(
  agentActionId: string,
): Promise<ActionResult<null>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: en.agents.actionError };
  if (typeof agentActionId !== "string" || agentActionId === "") {
    return { ok: false, error: en.agents.actionError };
  }
  const res = await rejectAction(prisma, agentActionId, userId);
  if (!res.ok && res.reason === "forbidden") {
    return { ok: false, error: en.agents.actionError };
  }
  revalidatePath("/agents");
  return { ok: true, data: null };
}
