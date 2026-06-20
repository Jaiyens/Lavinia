"use server";

import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { runEngines } from "@/lib/recommendations/run";
import type { RecStatus } from "@/lib/recommendations";

// The one-tap responses on a finding card. Each maps to a Recommendation status:
// done (acted on it), dismissed (not now), overridden (running anyway).
const ALLOWED: RecStatus[] = ["done", "dismissed", "overridden"];

/**
 * Resolve a recommendation from the findings strip. Stamps the status + resolvedAt
 * and revalidates the home so the card leaves the strip. v1 only records the
 * farmer's choice; the agentic OS later executes `action.execute` on "done".
 *
 * A Server Action is a POST endpoint reachable independently of its page, and the id
 * arrives from the client, so it resolves ONLY this operator's own farm and scopes the
 * write to it - a finding can never be flipped on another grower's farm. (This tree used
 * to take an unauthenticated, unscoped write.)
 */
export async function resolveRecommendation(id: string, status: RecStatus): Promise<void> {
  if (!ALLOWED.includes(status)) throw new Error(`invalid status: ${status}`);
  const userId = await sessionUserId();
  const resolved = await dashboardFarm(prisma, userId);
  if (!resolved) return;
  await prisma.recommendation.updateMany({
    where: { id, farmId: resolved.farm.id },
    data: { status, resolvedAt: new Date() },
  });
  revalidatePath("/dashboard/pump-timing");
}

/**
 * Re-run the recommendation engines over the current farm and refresh the home.
 * Idempotent: runEngines only clears this farm's pending engine recs and re-inserts,
 * so a recheck never duplicates findings and never clobbers ones the farmer resolved.
 * Owner-scoped on the signed-in operator's farm (no demo fallback for an authed caller).
 */
export async function refreshFindings(): Promise<void> {
  const userId = await sessionUserId();
  const resolved = await dashboardFarm(prisma, userId);
  if (!resolved) return;
  await runEngines(prisma, resolved.farm.id);
  revalidatePath("/dashboard/pump-timing");
}
