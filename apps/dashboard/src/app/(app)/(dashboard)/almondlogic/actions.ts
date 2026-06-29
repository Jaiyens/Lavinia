"use server";

// Server Action for the Almond Logic portal. One mutation seam: after a sync lands, re-render the
// portal so the freshly-loaded snapshots/deliveries appear without a manual reload.
//
// A Server Action is a POST endpoint reachable independently of the page that rendered it, so it
// re-checks the session and the active-farm membership ITSELF rather than trusting any layout gate
// (the same pattern as resolveCropReviewAction in ../crops/actions.ts). It does NOT trigger the sync
// (the dev route spawns it; the prod route dispatches the agent) - it only revalidates the cached
// portal data the layout reads, so a viewer with no write access can still safely refresh their view.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";

/** The outcome of the revalidate. A discriminated result instead of a throw for the expected "no
 *  session / no farm" cases, so the client renders calmly rather than hitting an error boundary. */
export type RevalidateResult = { ok: boolean };

/**
 * Re-render the Almond Logic portal for the signed-in operator's own farm. Called by the sync button
 * the moment a sync reports "done": the scrape has written new AlmondSnapshot / CropDelivery rows,
 * and the portal layout loads grower/hullers/handlers from those, so revalidating the portal route
 * (segment "layout", which covers the layout AND every child screen) is what makes the new data show.
 *
 * Membership-gated: resolves the operator's OWN farm via dashboardFarm before doing anything, so this
 * can never be used to revalidate against a farm the caller cannot access. Read-only (no write, no
 * role gate beyond membership): refreshing a view is safe for any member, including viewers.
 */
export async function revalidateAlmondPortalAction(): Promise<RevalidateResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return { ok: false };
  }
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (!resolved) {
    return { ok: false };
  }
  // Revalidate the whole portal subtree so the layout (grower header + sidebar) and every screen
  // (Home / Grower Details / Runs / Reports) re-fetch the freshly-loaded snapshots and deliveries.
  revalidatePath("/almondlogic", "layout");
  return { ok: true };
}
