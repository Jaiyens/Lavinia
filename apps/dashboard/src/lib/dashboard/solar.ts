// The solar lens dataset (A-3). A PURE derivation over the canonical MeterView[] that
// loadMetersForFarm already projects: it picks out the solar-flagged meters, groups them under the
// arrays they benefit from, and rolls up the four KPI counts the strip shows. No Prisma, no React,
// no I/O, no clock - the "now" month is an injected argument (NFR1). It reads ONLY the per-meter
// fields and per-cycle summaries already on MeterView; it never touches the 15-minute interval
// series (NFR4), so it stays cheap at 183-meter scale and never blocks first paint.
//
// HONEST-BLANK discipline (the one law): this dataset carries program STRUCTURE and TIMING (which is
// in Terra's data today) and NEVER a net-metering credit dollar. The allocation PERCENTAGE arrives
// in Epic C (C-2: computed below from per-cycle usage summaries); the credit DOLLAR stays
// honest-blank until a true-up statement is on file (Epic G). So the array-group meter rows expose
// structure (name, nameplate, program token) PLUS the usage-proportional SHARE, but deliberately
// carry NO credit value - that cell renders through the honest-blank primitive until a statement
// lands. No percentage is ever multiplied into a dollar here.
//
// C-2 (FR8, NFR4): the share is computed by the pure `allocateArray` over each benefiting meter's
// cumulative billed usage (summed `BillingPeriod.totalKwh` summaries already projected onto
// MeterView - NEVER the 15-minute interval series, which MeterView does not even carry). A meter
// with no billed usage on file gets a null share (not-on-file), never a fabricated zero.

import {
  allocateArray,
  type AllocationMeterInput,
} from "@/lib/energy/solar-allocation";
import {
  buildTrueUpCalendar,
  type TrueUpCalendar,
  type TrueUpEntryInput,
} from "@/lib/energy/solar-calendar";
import {
  grandfatherPosition,
  type GrandfatherPosition,
} from "@/lib/energy/solar-grandfather";
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

/** One benefiting-meter row inside an array group. Carries structure PLUS the C-2 usage-proportional
 *  share; the credit DOLLAR (Epic G) stays honest-blank until a statement lands, never a fabricated
 *  zero, never a percent-times-dollar credit. */
export type ArrayGroupMeterRow = {
  pumpId: string;
  meterName: string;
  /** The meter's own paired nameplate; null = not on file (never derived from an array code). */
  solarKw: number | null;
  /** The meter's NEM token (resolved to a program-code label in A-4). */
  nemType: string | null;
  /** C-2 (FR8): this meter's usage-weighted share of THIS array's credits, in [0,1]; null = no billed
   *  usage on file (not-on-file, never a fabricated zero). Computed from per-cycle totalKwh summaries
   *  (NFR4), never the interval series. The credit DOLLAR is separate and stays honest-blank. */
  share: number | null;
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
  /** F-1 (FR16/FR18): the 20-year-from-PTO grandfather position. `unknown` when the interconnection
   *  date is not on file (the launch state) - honest-unknown, never a guessed vintage; only the NEM2
   *  cohort produces a countdown. Computed from the injected `asOf`, no clock. */
  grandfather: GrandfatherPosition;
  /** DM1 (F-1): the array's interconnection (PTO) date, ISO; null when not on file (the launch state).
   *  Fed to the F-2 degradation baseline so it can age the array; the grandfather position above is
   *  derived from it. */
  interconnectionDate: string | null;
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
  /**
   * The calm "needs review" count (zero = all clean): solar meters not linked to any array PLUS
   * NEMA array codes meters referenced but the populator could not link to a generating meter
   * (C-1, FR6). Both are surfaced rather than silently dropped, so the aggregation graph is
   * trustworthy. Never a guess - a count of honest gaps the grower can verify against PG&E.
   */
  needsReviewCount: number;
};

/**
 * One NEMA array code meters referenced but the populator built no SolarArray for (C-1, FR6). The
 * importer already returns these as `importInventory().unlinkedNemaCodes` (a referenced code with
 * no generating meter) and the referenced meters still persist - this surfaces that signal as a
 * needs-review row rather than a silent drop. Never a guess: the code is shown verbatim so the
 * grower can match it against their own records.
 */
export type UnlinkedCodeRow = {
  /** The NEMA code, verbatim as the master sheet listed it (never inferred, never normalized). */
  code: string;
};

/** The needs-review surfacing the Arrays lens renders below the array cards (C-1, FR6). */
export type SolarNeedsReview = {
  /** Solar meters with no array link (the same set the needs-review count includes). */
  unlinkedMeters: SolarMeterView[];
  /** NEMA codes meters referenced but no array was built for (from importInventory). */
  unlinkedCodes: UnlinkedCodeRow[];
};

/** The assembled solar lens dataset the /solar page renders. */
export type SolarDataset = {
  meters: SolarMeterView[];
  arrays: SolarArrayGroup[];
  kpis: SolarKpis;
  /**
   * D-1 (FR12/FR13): the true-up heartbeat. A twelve-month grid rolling forward from the injected
   * `nowMonth`, placing each solar meter's and array's true-up month with its settling counts, plus
   * the next-upcoming pull-out. The Calendar lens (D-2) renders it; the KPI strip's `nextTrueUp`
   * tile mirrors `kpis.nextTrueUp`. Carries STRUCTURE and TIMING only - the true-up DOLLAR stays
   * honest-blank until a statement is uploaded (Epic G), and is never carried here.
   */
  calendar: TrueUpCalendar;
  /** The needs-review surfacing (unlinked solar meters + unlinked NEMA codes), C-1/FR6. */
  needsReview: SolarNeedsReview;
  /**
   * DM4 (C-1, FR6): whether this farm's inventory export column layout was verified before relying
   * on the populated solar nameplates. False (the default, `Farm.solarLayoutVerifiedAt` null) puts
   * every nameplate in the CAUTIOUS state - the value is shown with an "unverified layout" qualifier
   * in copy, never suppressed and never presented as confirmed. True (a verification date on file)
   * renders the nameplate as verified. Enforced in the render, not merely recorded.
   */
  nameplateVerified: boolean;
};

/**
 * The non-meter inputs the solar dataset needs that do not live on MeterView: the DM4 verification
 * flag and the importer's unlinked NEMA codes (C-1, FR6). Supplied by the server page edge (which
 * reads `Farm.solarLayoutVerifiedAt` and the persisted import result); optional so a caller that
 * has neither yet (the default) gets the honest, fail-closed state - unverified nameplates and no
 * extra unlinked-code rows beyond the meters' own missing links.
 */
export type SolarDatasetContext = {
  /** `Farm.solarLayoutVerifiedAt != null`. Omitted/false => cautious nameplate (fail-closed). */
  nameplateVerified?: boolean;
  /** `importInventory().unlinkedNemaCodes` - referenced codes with no generating meter. */
  unlinkedNemaCodes?: string[];
  /** F-1 (FR16): the injected "now" instant (ISO) the grandfather countdown is measured against, so
   *  the dataset stays pure (no clock). Omitted => the grandfather position is honest-unknown for
   *  every array (the same fail-closed posture as a missing interconnection date). */
  asOf?: string;
};

/** Distinct true-up months in [1,12]; ignores anything out of range (honest, never guessed). */
function isMonth(m: number | null): m is number {
  return m !== null && Number.isInteger(m) && m >= 1 && m <= 12;
}

/**
 * Sum a meter's per-cycle `totalKwh` SUMMARIES into one cumulative usage basis for allocation (C-2,
 * NFR4). Returns null when NO cycle carries a totalKwh (honest absence -> not-on-file in the share),
 * never a fabricated zero. Reads only the summary already on MeterView; the 15-minute interval series
 * is never touched (it is not even projected onto MeterView).
 */
function cumulativeKwhFor(meter: MeterView): number | null {
  let seen = false;
  let sum = 0;
  for (const p of meter.periods) {
    if (p.totalKwh !== null && Number.isFinite(p.totalKwh)) {
      seen = true;
      sum += p.totalKwh;
    }
  }
  return seen ? sum : null;
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
export function buildSolarDataset(
  allMeters: MeterView[],
  nowMonth: number,
  context: SolarDatasetContext = {},
): SolarDataset {
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
  //
  // C-2: alongside each group we collect the benefiting meters' cumulative usage so the
  // usage-proportional SHARE can be computed per array (over all benefiting meters together), then
  // merged back onto each row. Building the group rows first and the shares second keeps the share a
  // function of the WHOLE array's usage, not of iteration order.
  type DraftGroup = {
    group: SolarArrayGroup;
    basis: AllocationMeterInput[];
  };
  const draftsById = new Map<string, DraftGroup>();
  for (const m of solar) {
    const cumulativeKwh = cumulativeKwhFor(m);
    for (const arr of m.benefitingArrays) {
      let draft = draftsById.get(arr.id);
      if (!draft) {
        draft = {
          group: {
            id: arr.id,
            name: arr.name,
            nameplateKw: arr.nameplateKw,
            nemType: arr.nemType,
            trueUpMonth: arr.trueUpMonth,
            // F-1 (FR16): honest-unknown when no asOf or no interconnection date is on file (the
            // launch state); only the NEM2 cohort with a date on file gets a real countdown.
            grandfather:
              context.asOf !== undefined
                ? grandfatherPosition({
                    interconnectionDate: arr.interconnectionDate,
                    nemType: arr.nemType,
                    asOf: context.asOf,
                  })
                : { state: "unknown" },
            interconnectionDate: arr.interconnectionDate,
            meters: [],
          },
          basis: [],
        };
        draftsById.set(arr.id, draft);
      }
      draft.group.meters.push({
        pumpId: m.id,
        meterName: m.name,
        solarKw: m.solarKw,
        nemType: m.nemType,
        // Filled below once the array's allocation is computed over all its benefiting meters.
        share: null,
      });
      draft.basis.push({ pumpId: m.id, meterName: m.name, cumulativeKwh });
    }
  }

  // Compute each array's usage-proportional shares (C-2, FR8) and merge the share onto its rows. The
  // pure `allocateArray` excludes a no-usage meter from the denominator and returns it as not-on-file
  // (share null), never a fabricated zero, never a divide-by-zero. NO credit dollar is computed here.
  for (const { group, basis } of draftsById.values()) {
    const allocation = allocateArray(group.id, group.name, basis);
    const shareByPump = new Map(allocation.shares.map((s) => [s.pumpId, s.share]));
    for (const row of group.meters) {
      row.share = shareByPump.get(row.pumpId) ?? null;
    }
  }

  // Stable array order by name (nulls last), so the Arrays lens renders deterministically.
  const arrays = [...draftsById.values()]
    .map((d) => d.group)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  // Needs-review (C-1, FR6): two honest gaps surfaced rather than dropped. (1) Solar meters with no
  // array link - the populator could not match them to any generating meter. (2) NEMA codes meters
  // referenced but the populator built no SolarArray for (a referenced code with no generating
  // meter), passed in from importInventory's result. Dedupe + sort the codes so the surfacing is
  // deterministic and a re-listed code is one row (never a guess, always verbatim).
  const unlinkedMeters = meters.filter((m) => !m.hasArray);
  const unlinkedCodes: UnlinkedCodeRow[] = [
    ...new Set((context.unlinkedNemaCodes ?? []).filter((c) => c.trim().length > 0)),
  ]
    .sort()
    .map((code) => ({ code }));
  const needsReview: SolarNeedsReview = { unlinkedMeters, unlinkedCodes };

  const kpis: SolarKpis = {
    solarMeterCount: meters.length,
    arrayCount: arrays.length,
    nextTrueUp: nextTrueUpAcross(meters, nowMonth),
    // Both honest gaps count toward "needs review": an unlinked solar meter AND an unlinked code.
    needsReviewCount: unlinkedMeters.length + unlinkedCodes.length,
  };

  // D-1 (FR12/FR13): the true-up calendar across the fleet. Feed every solar meter AND every array
  // that carries an on-file true-up month (a null/out-of-range month is simply not placed, counted
  // upstream as "no month on file"). The grid rolls forward from the same injected `nowMonth` the
  // KPI next-true-up uses, so the two never disagree about what is next. No dollar is carried.
  const calendarEntries: TrueUpEntryInput[] = [];
  for (const m of meters) {
    if (isMonth(m.trueUpMonth)) {
      calendarEntries.push({ id: m.id, kind: "meter", trueUpMonth: m.trueUpMonth });
    }
  }
  for (const a of arrays) {
    if (isMonth(a.trueUpMonth)) {
      calendarEntries.push({ id: a.id, kind: "array", trueUpMonth: a.trueUpMonth });
    }
  }
  const calendar = buildTrueUpCalendar(calendarEntries, nowMonth);

  return {
    meters,
    arrays,
    kpis,
    calendar,
    needsReview,
    // DM4: fail-closed. Absent flag (undefined/false) => cautious nameplate; a date => verified.
    nameplateVerified: context.nameplateVerified === true,
  };
}
