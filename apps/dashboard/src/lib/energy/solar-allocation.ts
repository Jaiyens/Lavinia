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

// Program-type classification (C-3, FR11). PURE: a plain { benefitingMeterCount, nemType } in, a
// closed string-literal token out. It answers the grower's real question - "do I or PG&E control
// the allocation?" - by naming the array's net-metering program type in one word the copy layer
// turns into plain operator English (never the raw token on the surface, NFR8).
//
// The classification:
//   - one benefiting meter            -> "nem"   (single-meter solar; the array credits its own meter)
//   - two or more benefiting meters   -> "nema"  (aggregation; one array's credits spread across meters)
//   - the explicit "vnem" token (DM3) -> "vnem"  (virtual NEM; PG&E controls the allocation)
//
// DM3 widens SolarArray.nemType's allowed values to admit "vnem" (documented inline in schema.prisma,
// mirrored in src/lib/recommendations/types.ts). VNEM is FORWARD-COMPATIBLE: there is no launch
// instance (the Batth cohort is NEM2 / NEMA), so the branch is proven only by a synthetic unit test.
// The explicit token wins over the meter count: a "vnem" array is VNEM even with a single meter on
// file, because the program type is a tariff fact, not an inference from how many meters happen to be
// linked today. Fail-closed: an absent / unrecognized token NEVER fabricates "vnem"; it falls back to
// the honest count-based classification (nem / nema), never a guessed program.

/** An array's net-metering program type, in plain tokens the copy layer renders in operator English. */
export type SolarProgramType = "nem" | "nema" | "vnem";

/** The one VNEM token DM3 widened SolarArray.nemType to admit (lower-cased before the comparison). */
const VNEM_TOKEN = "vnem";

/**
 * FR11. Classify an array's program type from its benefiting-meter count and its nemType token.
 * The explicit "vnem" token (DM3, case-insensitive) classifies as "vnem" regardless of count
 * (forward-compatible, no launch instance). Otherwise: one benefiting meter -> "nem"; two or more ->
 * "nema". A null / unrecognized token never fabricates "vnem" (fail-closed) - it defers to the honest
 * count. The surface renders a plain-English label via copy, never the raw token (NFR8).
 */
export function classifyProgramType(args: {
  benefitingMeterCount: number;
  nemType: string | null;
}): SolarProgramType {
  // The explicit VNEM token is a tariff fact, so it wins over the meter count (a VNEM array with a
  // single linked meter is still VNEM). Compared case-insensitively; nothing else fabricates it.
  if (args.nemType !== null && args.nemType.trim().toLowerCase() === VNEM_TOKEN) {
    return "vnem";
  }
  // Honest count-based classification for the NEM2 cohort: aggregation needs two-plus benefiting
  // meters; anything less is single-meter solar (a zero/negative count is honest single-meter solar,
  // never a fabricated aggregation).
  return args.benefitingMeterCount >= 2 ? "nema" : "nem";
}
