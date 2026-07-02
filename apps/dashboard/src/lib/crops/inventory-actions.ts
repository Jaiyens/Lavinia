"use server";

// Server Action for the good-meats inventory ledger: record ONE append-only adjustment (add or
// remove) with a REQUIRED reason. Manager-gated — it re-checks the session + active-farm membership +
// writer role itself, since a Server Action is a POST endpoint reachable independently of the page.
// It computes no pound: the pure toInventoryWrite validates + signs the amount; the row is the
// grower's own stated count (source MANUAL_ENTRY). Corrections are new offsetting rows, never edits.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { en } from "@/copy/en";
import type { ActionResult } from "@/app/(app)/actions";
import { withFarmTenant } from "./tenant-db";
import { toInventoryWrite, type InventoryWriteRaw } from "./inventory";
import { blockInFarm } from "./block-scope";

export async function addInventoryAdjustmentAction(
  raw: InventoryWriteRaw,
): Promise<ActionResult<null>> {
  const err = en.crops.worksheet.inventory.error;

  const session = await auth();
  if (!session?.user) return { ok: false, error: err };
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) return { ok: false, error: err };
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: err };
  }
  const farmId = resolved.farm.id;

  const input = toInventoryWrite(raw);
  if (input === null) return { ok: false, error: en.crops.worksheet.inventory.invalid };
  // A supplied block must belong to this farm (Block is not RLS-scoped); null = whole farm.
  if (!(await blockInFarm(prisma, farmId, input.blockId))) {
    return { ok: false, error: en.crops.worksheet.inventory.invalid };
  }

  try {
    await withFarmTenant(prisma, farmId, (tx) =>
      tx.inventoryItem.create({
        data: {
          farmId,
          cropYear: input.cropYear,
          blockId: input.blockId,
          variety: input.variety,
          packer: input.packer,
          stage: input.stage,
          netGoodMeatsLbs: input.netGoodMeatsLbs,
          source: input.source,
          reason: input.reason,
        },
      }),
    );
  } catch {
    return { ok: false, error: err };
  }
  revalidatePath("/almondlogic/inventory");
  return { ok: true, data: null };
}
