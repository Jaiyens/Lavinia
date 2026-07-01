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
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { saveGrowerPortalCredential } from "@/lib/crops/scrape/credential-store";
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

/**
 * Map (or unmap) an Almond Logic delivery field to a Terra block (WS1, cost per pound). `field` and
 * `blockId` arrive from the client, so neither is trusted: a malformed payload returns the calm
 * error instead of throwing into Prisma. Membership-scoped on the signed-in operator's active farm
 * so a mapping can never be written on another grower's farm; writer-gated (manager or owner)
 * because viewers are read-only. A non-null `blockId` upserts the (farm, field) mapping; a null
 * `blockId` deletes it (the field returns to the unmapped residual line). The write runs inside
 * withFarmTenant so Postgres RLS is in force on the CropFieldBlock table.
 */
export async function mapFieldToBlockAction(
  field: string,
  blockId: string | null,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: en.crops.cost.map.saveError };
  }
  if (typeof field !== "string" || field === "") {
    return { ok: false, error: en.crops.cost.map.saveError };
  }
  if (blockId !== null && (typeof blockId !== "string" || blockId === "")) {
    return { ok: false, error: en.crops.cost.map.saveError };
  }
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) {
    return { ok: false, error: en.crops.cost.map.saveError };
  }
  // Mapping is a WRITE: viewers are read-only, so require manager or owner.
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: en.crops.cost.map.saveError };
  }

  const farmId = resolved.farm.id;
  await withFarmTenant(prisma, farmId, async (tx) => {
    if (blockId === null) {
      // Unmap: the field returns to the residual line. A no-op delete (never mapped) is fine.
      await tx.cropFieldBlock.deleteMany({ where: { farmId, field } });
      return;
    }
    // Guard: the target block must belong to this farm, so a foreign blockId can never be linked.
    const block = await tx.block.findFirst({ where: { id: blockId, farmId }, select: { id: true } });
    if (block === null) return;
    // One block per field; re-mapping is an update (the @@unique([farmId, field]) anchors the upsert).
    await tx.cropFieldBlock.upsert({
      where: { farmId_field: { farmId, field } },
      create: { farmId, field, blockId },
      update: { blockId },
    });
  });
  // Revalidate the layout so the cost page + the Crops headline re-render with the new attribution.
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/**
 * Capture a grower's Almond Logic login for backend sync (Phase 2 live scrape). `username` and
 * `password` arrive from the client, so both are validated (non-empty strings) before use. The
 * plaintext is encrypted (AES-256-GCM, CROP_CRED_ENC_KEY) inside saveGrowerPortalCredential and is
 * NEVER logged, returned, or persisted in the clear. Membership-scoped on the signed-in operator's
 * own farm (a login can never be stored on another grower's farm); writer-gated (manager or owner)
 * because storing a credential is a privileged write. The store runs inside withFarmTenant so RLS is
 * in force on GrowerPortalCredential. Storing a NEW credential clears any stale session cookie.
 */
export async function saveAlmondLogicCredentialAction(
  username: string,
  password: string,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: en.crops.credential.saveError };
  }
  if (typeof username !== "string" || username === "" || typeof password !== "string" || password === "") {
    return { ok: false, error: en.crops.credential.saveError };
  }
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) {
    return { ok: false, error: en.crops.credential.saveError };
  }
  // Storing a credential is a privileged WRITE: viewers are read-only, so require manager or owner.
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: en.crops.credential.saveError };
  }

  await saveGrowerPortalCredential(prisma, resolved.farm.id, { username, password });
  return { ok: true, data: null };
}
