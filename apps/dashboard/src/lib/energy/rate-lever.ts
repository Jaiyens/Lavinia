// The rate-optimization lever (Story 3.3, FR-14): which meters sit on the wrong
// schedule, what would the SAME billed usage cost on the cheapest eligible current
// schedule, and is the dollar defensible. The defensibility test is the back-test
// gate: recompute the meter's CURRENT charges from the dated card and its own billed
// usage, and only quote a savings figure when that recompute lands inside a
// calibrated percentage band of the printed totals. Off-band legacy meters fall
// back to a qualitative finding; off-band current meters stay silent. Fail closed,
// everywhere: a wrong dollar costs more trust than no dollar.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in rate-lever.test.ts.

import {
  priceCycleCents,
  seasonFor,
  sizeClassFor,
  type CyclePriceInput,
  type RateCard,
  type RatePlan,
  type Season,
  type SizeClass,
  type TouPeriod,
} from "./rates";

/**
 * Back-test tolerance band, in percent of the printed total. A fixture recompute
 * never hits the print exactly: riders outside the card (Energy Commission Tax),
 * the 2026-03-01 mid-cycle rate change (pre-change sub-periods price ~4% hot on
 * the post-change card), and day-prorated demand charges all drift. Calibrated
 * 2026-06-09 against the real account's 34 testable reconciled SAs (39 reconciled
 * minus 4 non-ag B1 and 1 NEM-credit cycle): 27 land within 2%, 31 within 5%, and
 * the three beyond (6%, 12.2%, 12.4%) are genuine card/model gaps that SHOULD
 * fail closed. 5% holds the headline $11,727.33 pump (4.59% drift, almost all of
 * it the pre-03/01 demand sub-period priced on the post-change card) without
 * admitting the true outliers.
 * A model tolerance, not a rate (NFR-3 bars rates; this is neither $/kWh nor $/kW).
 */
export const BACK_TEST_BAND_PCT = 5;

/** A single wild cycle fails the meter even when the aggregate squeaks in. */
export const PER_CYCLE_BAND_FACTOR = 2;

/** Savings below one dollar over the billed span are noise, not a finding. */
export const MIN_SAVINGS_CENTS = 100;

/** The line-item slice of a canonical billing period the lever reads. */
export type LeverLineItem = {
  kind: string;
  label: string | null;
  amountCents: number;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
};

/** One canonical billing period as the dashboard edge projects it. */
export type LeverPeriod = {
  /** ISO 8601. */
  start: string;
  /** ISO 8601. */
  close: string;
  /** Integer cents; null until reconciled. */
  printedTotalCents: number | null;
  lineItems: LeverLineItem[];
};

/** A billing cycle reduced to what `priceCycleCents` needs, plus its printed total. */
export type LeverCycle = {
  start: string;
  close: string;
  days: number;
  season: Season;
  energyKwh: Partial<Record<TouPeriod, number>>;
  /** Billed max demand kW for the cycle; null when the bill carried no demand. */
  billedMaxKw: number | null;
  printedTotalCents: number;
};

export type CycleExclusionReason =
  | "no_printed_total"
  | "credit_cycle"
  | "zero_total"
  | "invalid_period"
  | "unmapped_energy_bucket";

export type CycleExclusion = {
  start: string;
  close: string;
  reason: CycleExclusionReason;
};

// ---------------------------------------------------------------------------
// Schedule-label mapping (closes the 3.2 deferral: familyOf cannot parse the
// bill's printed spellings).
// ---------------------------------------------------------------------------

/** A schedule's real PG&E size eligibility, distinct from the card's pricing rows. */
export type RealTier = "small" | "large";

/**
 * The bill's printed schedule spellings, keyed by the leading token with hyphens
 * stripped ("AG5B Large Time-of-Use Agricultural Power" -> "AG5B"; the card's own
 * "AG-A1" also normalizes here). Entries without a sizeClass/realTier resolve by
 * billed demand vs the card's 35 kW break.
 *
 * `sizeClass` picks the CARD ROW the schedule bills under (verified against the
 * real prints: AGA2 bills at the card's AG-A2 row, AGB at AG-B2, AGC at AG-C2).
 * `realTier` is the schedule's PUBLISHED size eligibility, which the card's
 * internal tier rows do not always mirror: the bill prints "AGA2 Ag<35 kW High
 * Use" (a SMALL schedule) while the card models AG-A2 as its large row. Candidate
 * eligibility must follow realTier, never the card row, or the lever proposes a
 * <35 kW schedule to a 100HP pump. AG5B/AG5C tiers follow the card's per-plan
 * provenance notes (AG5B = the large meter's print, AG5C = the small meters').
 */
const LABEL_TO_PLAN: Record<
  string,
  { family: string; sizeClass?: SizeClass; realTier?: RealTier }
> = {
  AGA1: { family: "AG-A", sizeClass: "small", realTier: "small" },
  AGA2: { family: "AG-A", sizeClass: "large", realTier: "small" },
  AGB: { family: "AG-B", sizeClass: "large", realTier: "large" },
  AGB1: { family: "AG-B", sizeClass: "small", realTier: "large" },
  AGB2: { family: "AG-B", sizeClass: "large", realTier: "large" },
  AGC: { family: "AG-C", sizeClass: "large", realTier: "large" },
  AGC1: { family: "AG-C", sizeClass: "small", realTier: "large" },
  AGC2: { family: "AG-C", sizeClass: "large", realTier: "large" },
  AG4: { family: "AG-4" },
  AG4A: { family: "AG-4" },
  AG4B: { family: "AG-4" },
  AG4C: { family: "AG-4" },
  AG5: { family: "AG-5" },
  AG5B: { family: "AG-5", sizeClass: "large", realTier: "large" },
  AG5C: { family: "AG-5", sizeClass: "small", realTier: "small" },
};

export type MappedSchedule = { plan: RatePlan; realTier: RealTier };

/**
 * Resolve a bill-printed schedule label (bare or descriptor-suffixed, any case)
 * to the card plan it bills under plus its real size eligibility. Unknown and
 * non-ag labels (B1...) return null: no finding is ever built on a guessed
 * schedule.
 */
export function mapScheduleLabel(
  label: string,
  card: RateCard,
  billedMaxKw: number | null,
): MappedSchedule | null {
  // Strip a single leading "H" (PG&E's SmartRate/historical-interval prefix on
  // the Download-My-Data export: HAGC, HAGA2, ...) ONLY when the bare token is
  // not already a known plan key. This recovers HAGC->AGC, HAGA2->AGA2,
  // HAGA1->AGA1, HAGB->AGB, HAG5B->AG5B (the bulk of Batth's meters). It cannot
  // mis-map a non-ag H-code: HE1->E1, HB1->B1, HEM->EM etc. land outside
  // LABEL_TO_PLAN and stay correctly NULL (fail closed). No LABEL_TO_PLAN key
  // starts with "H", so the guard's only effect is on H-prefixed inputs.
  const raw = label.trim().toUpperCase().split(/\s+/)[0]?.replace(/-/g, "") ?? "";
  const token = LABEL_TO_PLAN[raw] ? raw : raw.replace(/^H/, "");
  const entry = LABEL_TO_PLAN[token];
  if (!entry) return null;
  const demandTier: SizeClass =
    billedMaxKw !== null ? sizeClassFor(billedMaxKw, card) : "small";
  const sizeClass = entry.sizeClass ?? demandTier;
  const plan =
    card.plans.find((p) => p.family === entry.family && p.sizeClass === sizeClass) ??
    null;
  if (plan === null) return null;
  return { plan, realTier: entry.realTier ?? demandTier };
}

/** The card plan a bill-printed schedule label bills under, or null. */
export function planFromLabel(
  label: string,
  card: RateCard,
  billedMaxKw: number | null,
): RatePlan | null {
  return mapScheduleLabel(label, card, billedMaxKw)?.plan ?? null;
}

/**
 * Why a label did not map, so an intentional exclusion (a non-ag schedule the
 * AG card cannot price) reads distinctly from an AG-mapping failure the founder
 * should chase. ONLY meaningful for labels mapScheduleLabel already returned
 * null for; it must never re-label a recovered AG code (HAGC/HAGA1/HAGA2/HAGB/
 * HAG5B map after the leading-H strip and so never reach here).
 *
 * - "non_ag": a known non-agricultural schedule (A1x small commercial, B1/B6
 *   and their H-prefixed historical spellings, the HE family / E19 commercial
 *   TOU family). The AG card has no plan for these; they need a non-ag
 *   reference, not an AG switch.
 * - "ag_no_card": an AG-shaped token with no plan family on this card (HAGFB ->
 *   no FB family). Fail closed: a real ag meter the card simply cannot price.
 * - "unknown": anything else.
 */
export type UnmappedScheduleClass = "non_ag" | "ag_no_card" | "unknown";

export function classifyUnmappedSchedule(label: string): UnmappedScheduleClass {
  // Same leading-token derivation as mapScheduleLabel (hyphen-stripped, upper).
  const raw = label.trim().toUpperCase().split(/\s+/)[0]?.replace(/-/g, "") ?? "";
  // AG-shaped but unmapped: the H-strip already recovered every AG family the
  // card carries, so a still-unmapped AG token has no card plan (HAGFB->AGFB).
  if (/^H?AG/.test(raw)) return "ag_no_card";
  // Known non-ag schedules the AG card cannot price.
  if (/^A\d/.test(raw)) return "non_ag"; // A1X (small commercial)
  if (/^HB\d/.test(raw)) return "non_ag"; // HB1, HB6 (historical commercial)
  if (/^B\d/.test(raw)) return "non_ag"; // B1, B6
  if (/^HE/.test(raw)) return "non_ag"; // HE1, HE1N, HEM, HETOUC, HETOUCN
  if (/^E\d/.test(raw)) return "non_ag"; // E19P
  return "unknown";
}

/**
 * The current schedules a meter of each real tier may actually take, named by
 * card row (rows verified against real prints). AG-A is PG&E's <35 kW family;
 * AG-B and AG-C are the 35+ families. The card's unverified small rows for
 * AG-B/AG-C (AG-B1/AG-C1) are deliberately NOT candidates: they would price a
 * switch no real meter of that tier can make.
 */
const CANDIDATE_SCHEDULES: Record<RealTier, readonly string[]> = {
  small: ["AG-A1", "AG-A2"],
  large: ["AG-B2", "AG-C2"],
};

// ---------------------------------------------------------------------------
// Cycle projection: canonical period -> the recompute input.
// ---------------------------------------------------------------------------

/** Map a printed TOU label to the card's bucket; null = a bucket the card cannot price. */
export function touBucketForLabel(label: string | null): TouPeriod | null {
  if (label === null) return null;
  const l = label.trim().toLowerCase();
  if (l === "peak") return "peak";
  if (/^off[ -]?peak$/.test(l)) return "off_peak";
  if (/^part(ial)?[ -]?peak$/.test(l)) return "partial_peak";
  return null; // "Super Off-Peak" etc: not an ag-card bucket, fail closed.
}

const DAYS_RE = /(\d+)\s*days?\s*@/i;
const DEMAND_KW_RE = /(\d+(?:\.\d+)?)\s*kW\s*@/i;
const MS_PER_DAY = 86_400_000;

/**
 * The billed max demand kW a period's line items show, or null when none do.
 * Prefers the printed demand labels ("244.320000 kW @$26.03000", max across
 * sub-periods); the `demand`-KIND rows aggregate sub-periods (their quantity can
 * be a SUM of sub-period kW, not the billed max) so they are only a last-resort
 * fallback, biased hot, which fails closed at the gate. Exported so the lever can
 * read demand off EXCLUDED periods too (a credit cycle's peak still counts toward
 * the 35 kW size ratchet).
 */
export function billedDemandFromLineItems(lineItems: LeverLineItem[]): number | null {
  let labelKw: number | null = null;
  let demandRowKw: number | null = null;
  for (const li of lineItems) {
    if (li.kind === "other" && li.label !== null && /demand/i.test(li.label)) {
      const m = li.label.match(DEMAND_KW_RE);
      if (m?.[1]) labelKw = Math.max(labelKw ?? 0, Number(m[1]));
    }
    if (li.kind === "demand" && li.quantity !== null) {
      demandRowKw = Math.max(demandRowKw ?? 0, li.quantity);
    }
  }
  return labelKw ?? demandRowKw;
}

/**
 * Reduce one reconciled period to a LeverCycle, or exclude it with a reason.
 *
 * - days: summed from the customer-charge prints ("18 days @ $1.19446" +
 *   "12 days @ $1.19446" on a cycle straddling the 2026-03-01 rate change). The
 *   printed sum is trusted only when it lands near the inclusive start..close
 *   span: a straddling cycle whose sub-period labels use MIXED formats (one
 *   prints a day count, one does not) would otherwise silently undercount the
 *   cycle. Off-span parses fall back to the span.
 * - energyKwh: tou_energy quantities summed per bucket across sub-period rows.
 * - billedMaxKw: see billedDemandFromLineItems.
 * - credit cycles (negative printed total, NEM export) are not back-testable
 *   against a consumption-only recompute; a $0 total is equally untestable (a
 *   deviation against zero is undefined and would otherwise sail through the
 *   per-cycle band). A nonsensical date span (close before start) is an
 *   extraction error and must not throw the whole farm run. All excluded
 *   visibly, never silently.
 */
export function cycleFromPeriod(
  period: LeverPeriod,
  card: RateCard,
): { cycle: LeverCycle } | { excluded: CycleExclusion } {
  const { start, close } = period;
  if (period.printedTotalCents === null) {
    return { excluded: { start, close, reason: "no_printed_total" } };
  }
  if (period.printedTotalCents < 0) {
    return { excluded: { start, close, reason: "credit_cycle" } };
  }
  if (period.printedTotalCents === 0) {
    return { excluded: { start, close, reason: "zero_total" } };
  }

  const spanDays =
    Math.round((Date.parse(close) - Date.parse(start)) / MS_PER_DAY) + 1;
  if (!Number.isFinite(spanDays) || spanDays <= 0) {
    return { excluded: { start, close, reason: "invalid_period" } };
  }

  const energyKwh: Partial<Record<TouPeriod, number>> = {};
  for (const li of period.lineItems) {
    if (li.kind !== "tou_energy") continue;
    const bucket = touBucketForLabel(li.label);
    if (bucket === null) {
      return { excluded: { start, close, reason: "unmapped_energy_bucket" } };
    }
    energyKwh[bucket] = (energyKwh[bucket] ?? 0) + (li.quantity ?? 0);
  }

  let printedDays = 0;
  for (const li of period.lineItems) {
    if (li.kind === "other" && li.label !== null && /customer charge/i.test(li.label)) {
      const m = li.label.match(DAYS_RE);
      if (m?.[1]) printedDays += Number(m[1]);
    }
  }

  // Trust the printed day count only when it is plausibly complete (within 2
  // days of the inclusive span); a partial parse undercounts the customer charge.
  const days =
    printedDays > 0 && Math.abs(printedDays - spanDays) <= 2 ? printedDays : spanDays;

  return {
    cycle: {
      start,
      close,
      days,
      season: seasonFor(start, card),
      energyKwh,
      billedMaxKw: billedDemandFromLineItems(period.lineItems),
      printedTotalCents: period.printedTotalCents,
    },
  };
}

// ---------------------------------------------------------------------------
// The back-test gate + candidate pricing.
// ---------------------------------------------------------------------------

function priceInput(cycle: LeverCycle): CyclePriceInput {
  return {
    days: cycle.days,
    season: cycle.season,
    energyKwh: cycle.energyKwh,
    maxDemandKw: cycle.billedMaxKw,
    // Winter bills carry no peak-period demand print; summer cycles will need a
    // parsed peak-window kW before this lever prices AG-C peak demand candidates.
    peakWindowDemandKw: null,
  };
}

export type CycleBackTest = {
  start: string;
  close: string;
  printedTotalCents: number;
  recomputedTotalCents: number;
  /** Signed percent: positive = the card recomputes hot. */
  deviationPct: number;
};

export type MeterBackTest = {
  testedCycles: number;
  sumPrintedCents: number;
  sumRecomputedCents: number;
  /** Sum of per-cycle ABSOLUTE errors in cents (model error that cannot cancel). */
  sumAbsErrorCents: number;
  /**
   * Sum of absolute per-cycle errors over the printed total, in percent; null
   * when nothing is testable. Absolute per cycle so a +9% and a -9% cycle read
   * as 9% model error, never as a clean 0% net.
   */
  aggregateDeviationPct: number | null;
  perCycle: CycleBackTest[];
};

/** Recompute each cycle's CURRENT charges from the card and compare to the print. */
export function backTestMeter(cycles: LeverCycle[], plan: RatePlan): MeterBackTest {
  const perCycle: CycleBackTest[] = cycles.map((c) => {
    const recomputed = priceCycleCents(priceInput(c), plan).totalCents;
    return {
      start: c.start,
      close: c.close,
      printedTotalCents: c.printedTotalCents,
      recomputedTotalCents: recomputed,
      // cycleFromPeriod guarantees printed > 0; a hand-built non-positive cycle
      // fails closed with an infinite deviation rather than a free pass.
      deviationPct:
        c.printedTotalCents > 0
          ? ((recomputed - c.printedTotalCents) / c.printedTotalCents) * 100
          : Number.POSITIVE_INFINITY,
    };
  });
  const sumPrinted = perCycle.reduce((s, c) => s + c.printedTotalCents, 0);
  const sumRecomputed = perCycle.reduce((s, c) => s + c.recomputedTotalCents, 0);
  const sumAbsError = perCycle.reduce(
    (s, c) => s + Math.abs(c.recomputedTotalCents - c.printedTotalCents),
    0,
  );
  return {
    testedCycles: perCycle.length,
    sumPrintedCents: sumPrinted,
    sumRecomputedCents: sumRecomputed,
    sumAbsErrorCents: sumAbsError,
    aggregateDeviationPct:
      perCycle.length > 0 && sumPrinted > 0 ? (sumAbsError / sumPrinted) * 100 : null,
    perCycle,
  };
}

/** What the same cycles cost under a plan, integer cents (model vs model). */
export function costUnderPlanCents(cycles: LeverCycle[], plan: RatePlan): number {
  return cycles.reduce((s, c) => s + priceCycleCents(priceInput(c), plan).totalCents, 0);
}

// ---------------------------------------------------------------------------
// The lever.
// ---------------------------------------------------------------------------

export type RateLeverInput = {
  /** The meter's stored schedule, as the bill prints it. */
  scheduleLabel: string | null;
  /** The meter's reconciled billing periods (pass [] when coverage is not reconciled). */
  periods: LeverPeriod[];
};

export type RateLeverOptions = {
  bandPct?: number;
  perCycleBandFactor?: number;
  minSavingsCents?: number;
};

export type RateLeverEstimate = {
  kind: "estimate";
  isLegacy: boolean;
  /** The current plan as mapped (its card schedule name). */
  currentSchedule: string;
  targetSchedule: string;
  savingsCents: number;
  currentCostCents: number;
  targetCostCents: number;
  /** Billed days the savings figure spans. */
  daysBasis: number;
  cyclesTested: number;
  aggregateDeviationPct: number;
  bandPct: number;
  excluded: CycleExclusion[];
};

export type RateLeverQualitative = {
  kind: "qualitative";
  isLegacy: true;
  currentSchedule: string;
  reason: "off_band" | "no_testable_cycles" | "no_savings";
  excluded: CycleExclusion[];
};

export type RateLeverNone = {
  kind: "none";
  /** null when the schedule never mapped to a card plan. */
  isLegacy: boolean | null;
  reason:
    | "no_schedule"
    | "unmapped_schedule"
    | "off_band"
    | "no_testable_cycles"
    | "no_usage_basis"
    | "no_savings";
  /**
   * Set only when reason is "unmapped_schedule": why the label did not map, so an
   * intentional exclusion (a non-ag schedule the AG card cannot price) is reported
   * distinctly from an AG-mapping failure. Additive and fail-closed: still no
   * finding either way.
   */
  unmappedClass?: UnmappedScheduleClass;
  excluded: CycleExclusion[];
};

export type RateLeverResult = RateLeverEstimate | RateLeverQualitative | RateLeverNone;

/**
 * Run the lever for one meter. The eligibility ratchet (AC4): candidates are
 * CURRENT, AGRICULTURAL plans only, and the 35 kW threshold is one-way - a meter
 * whose mapped plan is the large tier, or whose billed demand reaches the break on
 * ANY cycle, only sees large-tier candidates. Winter-only observation must never
 * downgrade a meter to a small-tier schedule (winter demand understates summer).
 */
export function rateLever(
  input: RateLeverInput,
  card: RateCard,
  options: RateLeverOptions = {},
): RateLeverResult {
  const bandPct = options.bandPct ?? BACK_TEST_BAND_PCT;
  const perCycleBandPct =
    bandPct * (options.perCycleBandFactor ?? PER_CYCLE_BAND_FACTOR);
  const minSavingsCents = options.minSavingsCents ?? MIN_SAVINGS_CENTS;

  if (input.scheduleLabel === null || input.scheduleLabel.trim() === "") {
    return { kind: "none", isLegacy: null, reason: "no_schedule", excluded: [] };
  }

  const cycles: LeverCycle[] = [];
  const excluded: CycleExclusion[] = [];
  for (const period of input.periods) {
    const r = cycleFromPeriod(period, card);
    if ("cycle" in r) cycles.push(r.cycle);
    else excluded.push(r.excluded);
  }

  // The 35 kW ratchet reads demand off EVERY period, excluded ones included: a
  // credit cycle's peak is still this meter's peak, and missing it could let a
  // <35 kW candidate through for a large meter.
  const maxBilledKw = input.periods.reduce<number | null>((max, p) => {
    const kw = billedDemandFromLineItems(p.lineItems);
    return kw === null ? max : Math.max(max ?? 0, kw);
  }, null);

  const mapped = mapScheduleLabel(input.scheduleLabel, card, maxBilledKw);
  if (mapped === null) {
    return {
      kind: "none",
      isLegacy: null,
      reason: "unmapped_schedule",
      unmappedClass: classifyUnmappedSchedule(input.scheduleLabel),
      excluded,
    };
  }
  const { plan } = mapped;

  const fallback = (
    reason: "off_band" | "no_testable_cycles" | "no_savings",
  ): RateLeverResult =>
    plan.legacy
      ? { kind: "qualitative", isLegacy: true, currentSchedule: plan.schedule, reason, excluded }
      : { kind: "none", isLegacy: false, reason, excluded };

  if (cycles.length === 0) return fallback("no_testable_cycles");

  const backTest = backTestMeter(cycles, plan);
  const pass =
    backTest.aggregateDeviationPct !== null &&
    backTest.aggregateDeviationPct <= bandPct &&
    backTest.perCycle.every((c) => Math.abs(c.deviationPct) <= perCycleBandPct);
  if (!pass) return fallback("off_band");

  // A current-schedule swap must rest on real usage: an idle winter meter's
  // customer-charge delta is not a defensible reason to switch between current
  // usage-tiered schedules (summer flips it). Legacy meters are exempt: the move
  // off a closed schedule is structurally right and its day-rate delta holds
  // year round. (Only reachable for non-legacy plans, hence the inline return.)
  const totalKwhTested = cycles.reduce(
    (s, c) =>
      s +
      (c.energyKwh.peak ?? 0) +
      (c.energyKwh.partial_peak ?? 0) +
      (c.energyKwh.off_peak ?? 0),
    0,
  );
  if (!plan.legacy && totalKwhTested <= 0) {
    return { kind: "none", isLegacy: false, reason: "no_usage_basis", excluded };
  }

  // One-way size ratchet on REAL tiers: large stays large; a small meter is
  // promoted by observed billed demand. Winter-only data never downgrades.
  const tier: RealTier =
    mapped.realTier === "large" ||
    (maxBilledKw !== null && maxBilledKw > card.sizeBreakKw)
      ? "large"
      : "small";

  // A candidate that bills a summer peak-period demand charge (AG-C) cannot be
  // priced honestly for a summer cycle without a peak-window kW, which the
  // canonical shape does not carry yet - skip it rather than underprice it.
  const hasSummerCycle = cycles.some((c) => c.season === "summer");
  const candidates = card.plans.filter(
    (p) =>
      !p.legacy &&
      p.agricultural &&
      CANDIDATE_SCHEDULES[tier].includes(p.schedule) &&
      p.schedule !== plan.schedule &&
      !(hasSummerCycle && p.summer.demand.peakPeriodDemandPerKw !== undefined),
  );
  if (candidates.length === 0) return fallback("no_savings");

  const currentCostCents = backTest.sumRecomputedCents;
  let best: { plan: RatePlan; costCents: number } | null = null;
  for (const candidate of candidates) {
    const costCents = costUnderPlanCents(cycles, candidate);
    if (best === null || costCents < best.costCents) best = { plan: candidate, costCents };
  }
  if (best === null) return fallback("no_savings");

  // The quoted dollar must exceed the model's OWN observed error on this meter:
  // a recompute the gate allowed to drift $X cannot honestly quote savings
  // smaller than $X (the savings would be indistinguishable from drift).
  const savingsCents = currentCostCents - best.costCents;
  const savingsFloorCents = Math.max(minSavingsCents, backTest.sumAbsErrorCents);
  if (savingsCents < savingsFloorCents) return fallback("no_savings");

  return {
    kind: "estimate",
    isLegacy: plan.legacy,
    currentSchedule: plan.schedule,
    targetSchedule: best.plan.schedule,
    savingsCents,
    currentCostCents,
    targetCostCents: best.costCents,
    daysBasis: cycles.reduce((s, c) => s + c.days, 0),
    cyclesTested: backTest.testedCycles,
    aggregateDeviationPct: backTest.aggregateDeviationPct ?? 0,
    bandPct,
    excluded,
  };
}
