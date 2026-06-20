// The allocation DB edge (C-2, FR8, NFR4). It loads the usage BASIS the pure `allocateArray` needs -
// each benefiting meter's cumulative billed usage per array - and NOTHING else. Takes an explicit
// PrismaClient and the resolved farmId (active-farm scoping; no farmId ever from the client/model).
//
// OOM-SAFE (NFR4, the documented 183-meter constraint): it reads ONLY the per-cycle
// `BillingPeriod.totalKwh` SUMMARIES, summed per meter. It NEVER selects the 15-minute
// `UsageInterval` series. The select below names exactly { id, name, billingPeriods.totalKwh } and
// the array linkage; there is no `usageIntervals` include, so the allocation path cannot trigger an
// interval load. `solar-load.db.test.ts` asserts both halves: totalKwh IS loaded, and no per-interval
// query runs on this path.
//
// HONEST-BLANK (FR10): this edge carries usage only. It computes NO dollar; the credit DOLLAR stays
// honest-blank until a true-up statement is on file (Epic G). A meter with no totalKwh on any cycle
// has cumulativeKwh=null (not-on-file), which `allocateArray` excludes from the denominator.

import type { PrismaClient } from "@prisma/client";
import type { AllocationMeterInput } from "@/lib/energy/solar-allocation";

/** One array's benefiting meters with their cumulative usage basis, ready for `allocateArray`. */
export type ArrayAllocationBasis = {
  arrayId: string;
  arrayName: string | null;
  /** Benefiting meters in stable name order, each with its summed totalKwh (null = not on file). */
  meters: AllocationMeterInput[];
};

/**
 * Sum a meter's per-cycle `totalKwh` summaries into one cumulative usage number. Returns null when
 * NO cycle on file carries a totalKwh (honest absence -> not-on-file in the allocation), never a
 * fabricated zero. A genuine zero-usage history (every cycle totalKwh=0) sums to 0, which the pure
 * `allocateArray` then treats as not-on-file too (no divide-by-zero) - so absence and all-zero both
 * read honestly, never as a dropped meter.
 */
function sumCumulativeKwh(totals: (number | null)[]): number | null {
  let seen = false;
  let sum = 0;
  for (const t of totals) {
    if (t !== null && Number.isFinite(t)) {
      seen = true;
      sum += t;
    }
  }
  return seen ? sum : null;
}

/**
 * Load, per array on this farm, the benefiting meters and each meter's cumulative billed usage
 * (summed `BillingPeriod.totalKwh`), for the pure allocation. SUMMARIES ONLY - no interval query
 * (NFR4). Active-farm scoped. The returned bases feed `allocateArray` directly; this edge does no
 * math beyond summing the per-cycle totals (the share split is the pure function's job).
 */
export async function loadArrayAllocationBases(
  prisma: PrismaClient,
  farmId: string,
): Promise<ArrayAllocationBasis[]> {
  const arrays = await prisma.solarArray.findMany({
    where: { farmId },
    select: {
      id: true,
      name: true,
      benefitingMeters: {
        select: {
          id: true,
          name: true,
          // SUMMARIES ONLY: the per-cycle totalKwh. NO `usageIntervals` here (NFR4).
          billingPeriods: { select: { totalKwh: true } },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return arrays.map((arr) => ({
    arrayId: arr.id,
    arrayName: arr.name,
    meters: arr.benefitingMeters.map((meter) => ({
      pumpId: meter.id,
      meterName: meter.name,
      cumulativeKwh: sumCumulativeKwh(meter.billingPeriods.map((p) => p.totalKwh)),
    })),
  }));
}
