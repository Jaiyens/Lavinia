"use server";

import { revalidatePath } from "next/cache";
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
 */
export async function resolveRecommendation(id: string, status: RecStatus): Promise<void> {
  if (!ALLOWED.includes(status)) throw new Error(`invalid status: ${status}`);
  await prisma.recommendation.update({
    where: { id },
    data: { status, resolvedAt: new Date() },
  });
  revalidatePath("/dashboard/pump-timing");
}

/**
 * Re-run the recommendation engines over the current farm and refresh the home.
 * Idempotent: runEngines only clears this farm's pending engine recs and re-inserts,
 * so a recheck never duplicates findings and never clobbers ones the farmer resolved.
 */
export async function refreshFindings(): Promise<void> {
  const resolved = await dashboardFarm(prisma);
  if (!resolved) return;
  await runEngines(prisma, resolved.farm.id);
  revalidatePath("/dashboard/pump-timing");
}
