"use server";

// Server Actions for the Crops tab (Phase 6). One mutation: a MANUAL resolve that clears a
// reconciliation-queue row's review flag. It returns the discriminated ActionResult instead of
// throwing for expected failures (a stale id, a farm mismatch). A Server Action is a POST endpoint
// reachable independently of the page that rendered it, so it re-checks the session, the active-farm
// membership, and the writer role ITSELF rather than trusting any layout gate (the same pattern as
// resolveFinding in ../../actions.ts).
//
// The module's law holds here: this resolve does NOT recompute or change any pounds. It only flips
// coverageState needs_review -> reconciled, clearing the review flag the operator certified by hand.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { isCropReviewKind, resolveCropReviewRow, type CropReviewKind } from "@/lib/crops/review";
import { en } from "@/copy/en";
import type { ActionResult } from "../../actions";

/**
 * Mark one reconciliation-queue row reconciled (manual resolve, Phase 6). `kind` + `id` arrive from
 * the client, so neither is trusted: a malformed payload returns the calm error instead of throwing
 * into Prisma. Membership-scoped on the signed-in operator's active farm so a row can never be
 * resolved on another grower's farm; writer-gated (manager or owner) because viewers are read-only.
 * The resolve clears the review flag only; a zero-row update (already reconciled, or never this
 * farm's) is treated as settled, and the refresh clears the stale row.
 */
export async function resolveCropReviewAction(
  kind: CropReviewKind,
  id: string,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: en.crops.review.resolveError };
  }
  if (typeof id !== "string" || id === "" || !isCropReviewKind(kind)) {
    return { ok: false, error: en.crops.review.resolveError };
  }
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) {
    return { ok: false, error: en.crops.review.resolveError };
  }
  // Resolving is a WRITE: viewers are read-only, so require manager or owner.
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: en.crops.review.resolveError };
  }

  // The atomic gates (farm ownership + still-needs_review) live in the WHERE inside
  // resolveCropReviewRow, so two clicks cannot both certify and the first write wins.
  await resolveCropReviewRow(prisma, resolved.farm.id, kind, id);
  // Revalidate the layout so the Crops tab re-renders without the resolved row.
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
