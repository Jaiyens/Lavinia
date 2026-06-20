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

// The allocation audit (C-4, FR9). PURE: it reads the C-2 allocation RESULT plus the membership the
// populator recorded, and reports two honest gaps the grower can take to PG&E - never a guess, never a
// dollar. A finding here is a "verify this with PG&E" signal, not a money-at-risk number: the credit
// DOLLAR stays honest-blank (FR10) until a true-up statement settles it, so the audit carries NO
// impactUsd. The two gaps:
//
//   - dropped_meter:    a meter that LISTS an array code (the master sheet links it to the array) but
//                       is ABSENT from that array's computed allocation - the populator could not link
//                       it to the generating meter, so its credits may be going nowhere. This is the
//                       LIVE, buildable-now check: it reads only the membership Terra already holds.
//
//   - mismatched_share: a meter whose PG&E-RECORDED allocation share diverges from the load-implied
//                       (usage-proportional) share Terra computed, by more than ALLOCATION_TOLERANCE_PP.
//                       The recorded share comes only from a real source on file (a true-up statement
//                       or a stated NEMA split); with none on file there is NO mismatch finding - the
//                       audit never invents a "recorded" share to compare against (fail-closed, FR10).
//                       It is FORWARD-COMPATIBLE: the Batth cohort has no recorded-split field yet, so
//                       this branch is proven by a synthetic unit test, the same discipline as VNEM.
//
// Both branches are honest gaps to verify, never an automatic correction and never a write-back.

/** A meter the master sheet links to an array, paired with its recorded (stated) allocation share,
 *  for the C-4 mismatch audit. recordedShare is the share PG&E/the statement applied, in [0,1]; null
 *  when no recorded share is on file (then this meter never produces a mismatch finding - the audit
 *  never fabricates a baseline to compare against). */
export type AllocationRecordedShare = {
  pumpId: string;
  /** PG&E's / the statement's recorded share for this meter, in [0,1]; null = none on file. */
  recordedShare: number | null;
};

/** One honest gap the allocation audit found, for the F3 finding (C-4, FR9). Carries NO dollar (the
 *  credit stays honest-blank, FR10); the percentages are usage/allocation shares, never money. */
export type AllocationAuditFinding =
  | { kind: "dropped_meter"; pumpId: string; arrayId: string }
  | {
      kind: "mismatched_share";
      pumpId: string;
      arrayId: string;
      /** Terra's load-implied (usage-proportional) share as a whole percent, 0-100 (tnum on screen). */
      computedPct: number;
      /** The recorded (stated) share as a whole percent, 0-100. */
      recordedPct: number;
    };

/**
 * FR9 audit over ONE array's C-2 allocation result. Two honest gaps, never a guess, never a dollar:
 *
 *   1. dropped_meter - for every meter in `listedButUnlinked` whose `arrayId` matches `result.arrayId`
 *      (it lists this array but is absent from the computed allocation): a `dropped_meter` finding. The
 *      LIVE check; reads only recorded membership.
 *
 *   2. mismatched_share - for a meter present in the result with a non-null computed share AND a
 *      non-null `recordedShare` on file, when the two diverge by MORE than `ALLOCATION_TOLERANCE_PP`
 *      percentage points: a `mismatched_share` finding. Within tolerance -> no finding. A meter with no
 *      recorded share, or no computed share (not-on-file usage), never produces a mismatch (fail-closed
 *      - the audit never invents a baseline). FORWARD-COMPATIBLE (no launch instance; synthetic test).
 *
 * The tolerance is the single documented `ALLOCATION_TOLERANCE_PP` constant. Pure: no Prisma, no clock,
 * no dollar. Findings preserve a stable order (dropped meters in input order, then mismatches in result
 * order) so the emitter and the inline render are deterministic.
 */
export function auditAllocation(args: {
  result: AllocationResult;
  /** Meters that list an array code but are absent from a computed allocation (a dropped meter). */
  listedButUnlinked: { pumpId: string; arrayId: string }[];
  /** Recorded (stated) shares to audit the computed share against; absent => no mismatch check. */
  recordedShares?: AllocationRecordedShare[];
}): AllocationAuditFinding[] {
  const { result, listedButUnlinked, recordedShares = [] } = args;
  const findings: AllocationAuditFinding[] = [];

  // 1) Dropped meters: every listed-but-unlinked meter scoped to THIS array, in input order.
  for (const m of listedButUnlinked) {
    if (m.arrayId === result.arrayId) {
      findings.push({ kind: "dropped_meter", pumpId: m.pumpId, arrayId: result.arrayId });
    }
  }

  // 2) Mismatched shares: compare the computed (load-implied) share against a recorded share on file.
  // Tolerance is in percentage POINTS, so both sides are taken to whole-percent space before the
  // comparison and the divergence is |computedPct - recordedPct|. A meter with no recorded share, or
  // with a not-on-file computed share, is skipped (the audit never fabricates a baseline).
  const recordedByPump = new Map(
    recordedShares
      .filter((r) => r.recordedShare !== null && Number.isFinite(r.recordedShare))
      .map((r) => [r.pumpId, r.recordedShare as number]),
  );
  for (const s of result.shares) {
    if (s.share === null) continue; // not-on-file usage: no honest baseline to mismatch against
    const recorded = recordedByPump.get(s.pumpId);
    if (recorded === undefined) continue; // no recorded share on file: never a fabricated mismatch
    const computedPct = s.share * 100;
    const recordedPct = recorded * 100;
    if (Math.abs(computedPct - recordedPct) > ALLOCATION_TOLERANCE_PP) {
      findings.push({
        kind: "mismatched_share",
        pumpId: s.pumpId,
        arrayId: result.arrayId,
        computedPct,
        recordedPct,
      });
    }
  }

  return findings;
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
