"use server";

// Server Action to record a SALE (a commitment to a named buyer). Manager-gated — it re-checks the
// session + active-farm membership + writer role itself. It computes no pound: the pure saleInput
// validates the entry and the pure availableToSell/oversoldBy decide the oversell flag against live
// TGM (NGM) minus live commitments. A forward sale that exceeds available is ALLOWED but the result
// reports how much it oversells by, so the UI flags it rather than showing a silent negative. The row
// is append-only (status "committed", supersedesId null); the existing collection lifecycle advances
// it later via supersede.

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { en } from "@/copy/en";
import type { ActionResult } from "@/app/(app)/actions";
import { withFarmTenant } from "./tenant-db";
import { availableToSell, oversoldBy, saleInput, type SaleRaw } from "./sale";

export async function createSaleAction(
  raw: SaleRaw,
): Promise<ActionResult<{ oversoldBy: number }>> {
  const err = en.crops.worksheet.sales.error;

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

  const input = saleInput(raw);
  if (input === null) return { ok: false, error: en.crops.worksheet.sales.invalid };

  try {
    const over = await withFarmTenant(prisma, farmId, async (tx) => {
      // Available for this cell = live TGM (NGM) - live committed, at write time.
      const [tgm, commitments] = await Promise.all([
        tx.tgmRecord.aggregate({
          where: { farmId, cropYear: input.cropYear, variety: input.variety, supersededBy: { none: {} } },
          _sum: { tgmLbs: true },
        }),
        tx.commitmentRecord.aggregate({
          where: { farmId, cropYear: input.cropYear, variety: input.variety, supersededBy: { none: {} } },
          _sum: { pounds: true },
        }),
      ]);
      const available = availableToSell(tgm._sum.tgmLbs ?? 0, commitments._sum.pounds ?? 0);

      await tx.commitmentRecord.create({
        data: {
          farmId,
          cropYear: input.cropYear,
          variety: input.variety,
          blockId: input.blockId,
          pounds: input.pounds,
          buyer: input.buyer,
          priceCentsPerPound: input.priceCentsPerPound,
          source: "MANUAL_ENTRY",
          status: "committed",
          supersededReason: "sale recorded",
        },
      });
      return oversoldBy(input.pounds, available);
    });

    revalidatePath("/almondlogic/sales");
    revalidatePath("/", "layout"); // the reconcile cash strip reads the same ledger
    return { ok: true, data: { oversoldBy: over } };
  } catch {
    return { ok: false, error: err };
  }
}
