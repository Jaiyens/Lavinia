"use server";

// Server Action for the commitment ledger's COLLECTION step (WS2b). One mutation: record the cash
// received against a live commitment, which advances it to the "collected" stage. The advance is
// APPEND-ONLY — it inserts a NEW CommitmentRecord that supersedes the live row (carrying status
// "collected" + the collected cents + the collectedAt timestamp); the prior row is never mutated, so
// the lifecycle stays rebuildable from the ledger and the audit trail is intact. This is the SAME
// gate discipline as resolveCropReviewAction: a Server Action is a POST endpoint reachable
// independently of the page that rendered it, so it re-checks the session, the active-farm
// membership, and the writer role ITSELF rather than trusting any layout gate.
//
// The module's law holds: this never recomputes a POUND. It copies the live commitment's pounds
// forward verbatim and only attaches the cash; recomputePositions sees the same committed pounds
// before and after.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { withFarmTenant } from "./tenant-db";
import { en } from "@/copy/en";
import type { ActionResult } from "@/app/(app)/actions";

/**
 * Record a collection against a live commitment, advancing it to "collected" (WS2b). `commitmentId`
 * + `collectedCents` arrive from the client, so neither is trusted: a malformed payload (empty id,
 * non-integer or negative cents) returns the calm error instead of throwing into Prisma. Scoped to
 * the signed-in operator's active farm so a commitment can never be collected on another grower's
 * farm; writer-gated (manager or owner) because viewers are read-only.
 *
 * Append-only: inside the tenant transaction we re-read the live row by id (re-asserting farm
 * ownership and that it is not already superseded), copy its pounds/buyer/year/variety/price forward
 * into a NEW row with status "collected", point that row's supersedesId at the live row, and stamp
 * collectedCents/collectedAt. The old row physically remains; recompute just stops counting it.
 */
export async function recordCollectionAction(
  commitmentId: string,
  collectedCents: number,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: en.crops.ledger.collectError };
  }
  if (typeof commitmentId !== "string" || commitmentId === "") {
    return { ok: false, error: en.crops.ledger.collectError };
  }
  // Cash must be a non-negative whole number of cents (the money law: integer cents, never floats).
  if (!Number.isInteger(collectedCents) || collectedCents < 0) {
    return { ok: false, error: en.crops.ledger.collectError };
  }

  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) {
    return { ok: false, error: en.crops.ledger.collectError };
  }
  // Recording a collection is a WRITE: viewers are read-only, so require manager or owner.
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: en.crops.ledger.collectError };
  }
  const farmId = resolved.farm.id;

  const ok = await withFarmTenant(prisma, farmId, async (tx) => {
    // The live row to advance. Farm-scoped (RLS plus the explicit WHERE). It must still be live:
    // a row that some other row already supersedes is dead, so refuse to chain off it.
    const row = await tx.commitmentRecord.findFirst({ where: { id: commitmentId, farmId } });
    if (row === null) return false;
    const superseder = await tx.commitmentRecord.findFirst({
      where: { farmId, supersedesId: commitmentId },
      select: { id: true },
    });
    if (superseder !== null) return false; // already superseded -> not the live row, no-op.

    await tx.commitmentRecord.create({
      data: {
        farmId,
        cropYear: row.cropYear,
        variety: row.variety,
        cropId: row.cropId,
        blockId: row.blockId,
        pounds: row.pounds, // pounds copied forward verbatim: a collection never moves a pound.
        buyer: row.buyer,
        priceCentsPerPound: row.priceCentsPerPound,
        settledPriceCentsPerPound: row.settledPriceCentsPerPound,
        source: row.source,
        status: "collected",
        collectedCents,
        collectedAt: new Date(),
        supersedesId: row.id,
        supersededReason: "collection recorded",
        controlTotalPounds: row.controlTotalPounds,
        coverageState: row.coverageState,
      },
    });
    return true;
  });

  if (!ok) {
    return { ok: false, error: en.crops.ledger.collectError };
  }

  // Revalidate the layout so the reconcile page re-renders with the advanced lifecycle + cash strip.
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
