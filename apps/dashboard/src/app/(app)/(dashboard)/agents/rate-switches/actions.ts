"use server";

// Server Action for the rate-switch request surface. The farm OWNER taps "Request this rate
// switch" on a proposed rate-switch action and Terra records the request (the founder's queue
// is the /agents audit list). RECOMMEND-ONLY: it records and freezes the prediction, it NEVER
// calls PG&E. Like the foundation's audit actions, it re-resolves the userId itself (a Server
// Action is an independently reachable POST, never trusting a layout gate) and routes the
// ownership check through the requestRateSwitch chokepoint on the action's OWN farmId, so the
// client supplies only the action id and a forged id cannot widen access. Returns the
// discriminated ActionResult instead of throwing for an expected failure.

import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import { requestRateSwitch } from "@/lib/agents/agents/rate-opt/switch-request";
import type { ActionResult } from "../../../actions";

/** Record the owner's request to switch a meter's rate. Re-checks the session, delegates to the
 *  requestRateSwitch chokepoint (which asserts ownership on the action's own farmId), then
 *  revalidates both this surface and the audit list so the card re-renders in its new state. A
 *  forbidden is the only hard refusal; not_found / wrong_state are settled outcomes that
 *  re-render cleanly. */
export async function requestRateSwitchAction(
  agentActionId: string,
): Promise<ActionResult<null>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: en.agents.rateAgent.requestError };
  if (typeof agentActionId !== "string" || agentActionId === "") {
    return { ok: false, error: en.agents.rateAgent.requestError };
  }
  const res = await requestRateSwitch(prisma, agentActionId, userId);
  if (!res.ok && res.reason === "forbidden") {
    return { ok: false, error: en.agents.rateAgent.requestError };
  }
  revalidatePath("/agents/rate-switches");
  revalidatePath("/agents");
  return { ok: true, data: null };
}
