// The solar lens dataset (A-3). A PURE derivation over the canonical MeterView[] that
// loadMetersForFarm already projects: it picks out the solar-flagged meters, groups them under the
// arrays they benefit from, and rolls up the four KPI counts the strip shows. No Prisma, no React,
// no I/O, no clock - the "now" month is an injected argument (NFR1). It reads ONLY the per-meter
// fields and per-cycle summaries already on MeterView; it never touches the 15-minute interval
// series (NFR4), so it stays cheap at 183-meter scale and never blocks first paint.
//
// HONEST-BLANK discipline (the one law): this dataset carries program STRUCTURE and TIMING (which is
// in Terra's data today) and NEVER a net-metering credit dollar. The allocation PERCENTAGE arrives
// in Epic C; the credit DOLLAR stays honest-blank until a true-up statement is on file (Epic G). So
// the array-group meter rows expose structure (name, nameplate, program token) and deliberately
// carry NO share and NO credit value at this story - those cells render through the honest-blank
// primitive (G-0) until the real value lands. No percentage is ever multiplied into a dollar here.

import type { MeterView } from "./load";

/** One solar-flagged meter, projected to the legibility fields the Solar tab renders (FR1, FR3). */
export type SolarMeterView = {
  id: string;
  name: string;
  accountNumber: string | null;
  entityName: string | null;
  ranchName: string | null;
  /** Paired array nameplate carried on the meter; null = not on file (FR3, never inferred). */
  solarKw: number | null;
  /** The generic/granular NEM token straight off the meter; resolved to a program code in A-4. */
  nemType: string | null;
  /** Annual settle month (1-12); null = not on file. */
  trueUpMonth: number | null;
  /** True when this meter is linked to at least one array (drives the needs-review count). */
  hasArray: boolean;
};

/** One benefiting-meter row inside an array group. Structure only at A-3; the usage-proportional
 *  share (Epic C) and the credit dollar (Epic G) are intentionally absent - they render honest-blank
 *  until their real values land, never a fabricated zero, never a percent-times-dollar credit. */
export type ArrayGroupMeterRow = {
  pumpId: string;
  meterName: string;
  /** The meter's own paired nameplate; null = not on file (never derived from an array code). */
  solarKw: number | null;
  /** The meter's NEM token (resolved to a program-code label in A-4). */
  nemType: string | null;
};

/** One array and the meters its credits offset (FR7: display-only, cross-entity grouping). */
export type SolarArrayGroup = {
  id: string;
  /** The array name (carries the NEMA code the populator wrote); null = unnamed. */
  name: string | null;
  /** The array nameplate said in plain words upstream ("840 kW solar"); never from a code (FR3). */
  nameplateKw: number;
  /** The array's program token ("nem2" | "nem2_agg" | "vnem"); classified in C-3. */
  nemType: string | null;
  /** The array's annual true-up month (1-12); null = not on file. */
  trueUpMonth: number | null;
  /** Every meter this array's credits offset, in stable name order. */
  meters: ArrayGroupMeterRow[];
};

/** The next-upcoming true-up across the fleet, relative to an injected current month (UX-DR2). */
export type NextTrueUp = {
  /** 1-12. */
  month: number;
  /** How many solar meters settle that month. */
  meterCount: number;
  /** Whole months from `nowMonth` to that month, 0-11 (0 = settling this month). */
  monthsAhead: number;
} | null;

/** The four KPI-strip figures (UX-DR2): no dollar tile, needs-review is a calm count. */
export type SolarKpis = {
  /** Count of solar-flagged meters in view. */
  solarMeterCount: number;
  /** Count of distinct arrays in view. */
  arrayCount: number;
  /** The nearest upcoming true-up, or null when no month is on file across the fleet. */
  nextTrueUp: NextTrueUp;
  /** Solar meters not linked to any array - the calm "needs review" count (zero = all linked). */
  needsReviewCount: number;
};

/** The assembled solar lens dataset the /solar page renders. */
export type SolarDataset = {
  meters: SolarMeterView[];
  arrays: SolarArrayGroup[];
  kpis: SolarKpis;
};

/** Distinct true-up months in [1,12]; ignores anything out of range (honest, never guessed). */
function isMonth(m: number | null): m is number {
  return m !== null && Number.isInteger(m) && m >= 1 && m <= 12;
}

/**
 * How near a true-up has to be (in whole months ahead, inclusive of the current month) to count as
 * "true-up soon". A single documented constant so the Map lens (the true-up-soon pin signal, FR35)
 * and any future surface share one window, the same way `nextTrueUpAcross` shares `isMonth`. Three
 * months reads as "this quarter" in plain operator terms, not a clock-precise countdown.
 */
export const TRUE_UP_SOON_MONTHS = 3;

/**
 * True when a meter's true-up settles within the next `TRUE_UP_SOON_MONTHS` (inclusive of the
 * current month), relative to an injected `nowMonth` (1-12, never read from a clock). Reuses the
 * same forward-wrapping 12-month window discipline as `nextTrueUpAcross` so the two never disagree
 * about what "soon" means. Honest absence (a meter with no true-up month, or an out-of-range now)
 * is never "soon" - never a fabricated date, never a guessed signal (FR35).
 */
export function isTrueUpSoon(trueUpMonth: number | null, nowMonth: number): boolean {
  if (!isMonth(trueUpMonth) || !isMonth(nowMonth)) return false;
  // Whole months from nowMonth forward to the true-up month, 0-11 (0 = settling this month).
  const ahead = (trueUpMonth - nowMonth + 12) % 12;
  return ahead < TRUE_UP_SOON_MONTHS;
}

/**
 * The next-upcoming true-up across the solar meters, relative to an injected current month
 * (`nowMonth`, 1-12, never read from a clock). Walks the next 12 months from `nowMonth` inclusive
 * and returns the first month any solar meter settles, with its settling count. A meter settling
 * exactly this month counts as 0 months ahead. Null when no meter has a true-up month on file -
 * honest absence, never a fabricated date.
 */
export function nextTrueUpAcross(meters: SolarMeterView[], nowMonth: number): NextTrueUp {
  if (!isMonth(nowMonth)) return null;
  const months = meters.map((m) => m.trueUpMonth).filter(isMonth);
  if (months.length === 0) return null;
  for (let ahead = 0; ahead < 12; ahead += 1) {
    // 1-12 wrap forward from nowMonth.
    const month = ((nowMonth - 1 + ahead) % 12) + 1;
    const meterCount = months.filter((m) => m === month).length;
    if (meterCount > 0) return { month, meterCount, monthsAhead: ahead };
  }
  return null;
}

/**
 * Assemble the solar lens dataset from the canonical MeterView[]. Includes EVERY meter with
 * isSolar=true and NO non-solar meter (FR1). Array groups are built from the meters' benefitingArrays
 * linkage: one group per distinct array, carrying the meters it offsets in name order (FR7, including
 * cross-entity meters - display-only grouping, no eligibility rule). `nowMonth` (1-12) is injected for
 * the next-true-up KPI so the function stays pure (NFR1). No interval series is read; no credit dollar
 * is computed (honest-blank, FR10).
 */
export function buildSolarDataset(allMeters: MeterView[], nowMonth: number): SolarDataset {
  const solar = allMeters.filter((m) => m.isSolar);

  const meters: SolarMeterView[] = solar.map((m) => ({
    id: m.id,
    name: m.name,
    accountNumber: m.accountNumber,
    entityName: m.entityName,
    ranchName: m.ranchName,
    solarKw: m.solarKw,
    nemType: m.nemType,
    trueUpMonth: m.trueUpMonth,
    hasArray: m.benefitingArrays.length > 0,
  }));

  // Build array groups from the meters' benefitingArrays linkage. A meter lists every array whose
  // credits offset it; we invert that into array -> meters. Keyed by array id so a re-listed array
  // is one group (idempotent). Meters already arrive in name order from the loader, so pushing in
  // iteration order keeps each group's meter rows name-sorted.
  const groupsById = new Map<string, SolarArrayGroup>();
  for (const m of solar) {
    for (const arr of m.benefitingArrays) {
      let group = groupsById.get(arr.id);
      if (!group) {
        group = {
          id: arr.id,
          name: arr.name,
          nameplateKw: arr.nameplateKw,
          nemType: arr.nemType,
          trueUpMonth: arr.trueUpMonth,
          meters: [],
        };
        groupsById.set(arr.id, group);
      }
      group.meters.push({
        pumpId: m.id,
        meterName: m.name,
        solarKw: m.solarKw,
        nemType: m.nemType,
      });
    }
  }
  // Stable array order by name (nulls last), so the Arrays lens renders deterministically.
  const arrays = [...groupsById.values()].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );

  const kpis: SolarKpis = {
    solarMeterCount: meters.length,
    arrayCount: arrays.length,
    nextTrueUp: nextTrueUpAcross(meters, nowMonth),
    needsReviewCount: meters.filter((m) => !m.hasArray).length,
  };

  return { meters, arrays, kpis };
}
