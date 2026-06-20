// Usage-proportional NEMA allocation (C-2, FR8). PURE math, no Prisma, no React, no I/O, no clock:
// it takes plain per-array meter usage summaries and returns each benefiting meter's usage-weighted
// SHARE of that array's credits. This is the heart of the aggregation wedge - the picture no
// incumbent assembles - and it is the one calculation the wedge's trust rests on, so it lives here
// with a colocated *.test.ts (NFR1) and is proven in isolation from the DB edge that feeds it.
//
// OOM-SAFE BY CONSTRUCTION (NFR4). The input is per-array cumulative `totalKwh` SUMMARIES (one number
// per meter, summed from BillingPeriod.totalKwh), NEVER the 15-minute interval series. The function
// cannot touch intervals because it is handed only the summed numbers; the DB edge that loads those
// summaries (`dashboard/solar-load.ts`) is what guarantees no per-interval query runs (its
// *.db.test.ts asserts it). At 183-meter Batth scale this is a handful of additions per array.
//
// HONEST-BLANK discipline (the one law, FR10): this module computes SHARES (the %), never a DOLLAR.
// Allocation percentages are buildable now from usage; the actual credit DOLLARS stay honest-blank
// until a true-up statement is uploaded (Epic G). NO code path here multiplies a share by a dollar.
// A meter with no billed usage on file is returned as not-on-file (excluded from the denominator),
// never a zero that would read as "dropped" and never a divide-by-zero.

/** One benefiting meter's cumulative billed usage basis for an array (per-cycle totalKwh summed). */
export type AllocationMeterInput = {
  pumpId: string;
  meterName: string;
  /** Sum of BillingPeriod.totalKwh across the meter's cycles. null = no billed usage on file. */
  cumulativeKwh: number | null;
};

/** One benefiting meter's resolved share of its array. */
export type AllocationShare = {
  pumpId: string;
  meterName: string;
  /** Usage-weighted share in [0,1]; null when this meter has no billed usage (not-on-file). */
  share: number | null;
};

/** The allocation picture for ONE array: who benefits how much, with honest not-on-file meters. */
export type AllocationResult = {
  arrayId: string;
  arrayName: string | null;
  /** One entry per input meter, in input order. Shares of non-null-usage meters sum to 1 (rounding). */
  shares: AllocationShare[];
  /** Meters with no billed usage, surfaced as not-on-file (never a zero that reads as dropped). */
  notOnFilePumpIds: string[];
};

/**
 * FR9 (the audit's tolerance, used in C-4): how far a computed share may diverge from a meter's
 * load-implied share before it is flagged as a mismatch. A single documented constant, in percentage
 * POINTS (not a ratio), so the audit (C-4) reads it from one place and the number never drifts.
 */
export const ALLOCATION_TOLERANCE_PP = 5;

/**
 * Pure usage-proportional allocation for ONE array. share_i = cumulativeKwh_i / sum(cumulativeKwh)
 * over the meters that have billed usage on file. A meter with null (or non-finite, or negative)
 * cumulativeKwh is EXCLUDED from the denominator and returned with share=null (not-on-file), and its
 * id is collected in `notOnFilePumpIds` - never a 0 that reads as "dropped". Empty input, or input
 * where every meter is not-on-file, returns shares=[]-with-nulls and an all-zero denominator handled
 * as not-on-file (never a divide-by-zero). Reads ONLY the passed summaries (NFR4); the DB edge that
 * feeds it loads totalKwh sums, never intervals.
 */
export function allocateArray(
  arrayId: string,
  arrayName: string | null,
  meters: AllocationMeterInput[],
): AllocationResult {
  // A meter's usage counts toward the denominator only when it is a real, finite, non-negative
  // number. A null / NaN / Infinity / negative usage is honest-absence, not a zero contribution.
  const usable = (kwh: number | null): kwh is number =>
    kwh !== null && Number.isFinite(kwh) && kwh >= 0;

  const denominator = meters.reduce<number>(
    (sum, m) => (usable(m.cumulativeKwh) ? sum + m.cumulativeKwh : sum),
    0,
  );

  const notOnFilePumpIds: string[] = [];
  const shares: AllocationShare[] = meters.map((m) => {
    // No billed usage on file (null/invalid), OR every meter on the array is not-on-file so the
    // denominator is 0: this meter is not-on-file, never a fabricated zero, never a divide-by-zero.
    if (!usable(m.cumulativeKwh) || denominator <= 0) {
      notOnFilePumpIds.push(m.pumpId);
      return { pumpId: m.pumpId, meterName: m.meterName, share: null };
    }
    return { pumpId: m.pumpId, meterName: m.meterName, share: m.cumulativeKwh / denominator };
  });

  return { arrayId, arrayName, shares, notOnFilePumpIds };
}
