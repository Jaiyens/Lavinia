// The reconcile-and-flag CORE (PURE). Turns one meter's reconciled bills into a
// single ReconciliationRecord: the card-recomputed total vs the real printed
// total, the absolute and percent error, a pass/fail against the configurable
// back-test band, and a best-guess CAUSE when it misses. It computes NO dollar of
// its own beyond re-pricing the bill through the SAME pure engine the rate-lever
// gate uses (cycleFromPeriod -> backTestMeter); when the recompute disagrees with
// the print it FLAGS the gap with a cause, it never nudges a figure to force a
// match.
//
// This is the shared seam: the engine edge (run-rate-lever.ts) logs it per meter,
// and the verification harness sweeps it across every billed meter. Both call
// reconcileMeter, so the nightly proof and the live log can never disagree.
//
// PURE: imports only the pure rate-lever engine + pure config. No process.env, no
// console, no I/O - the impure logging wrapper lives in back-test-log.ts.

import type { RateCard } from "./rates";
import type { BackTestTolerance } from "./back-test-config";
import {
  backTestMeter,
  billedDemandFromLineItems,
  cycleFromPeriod,
  mapScheduleLabel,
  type CycleBackTest,
  type CycleExclusion,
  type LeverCycle,
  type LeverPeriod,
  type MeterBackTest,
} from "./rate-lever";

/** PG&E's 2026-03-01 mid-cycle rate change: pre-change sub-periods price hot on
 *  the post-change card, the single documented systematic back-test miss. */
export const RATE_CHANGE_BOUNDARY_ISO = "2026-03-01";

/**
 * Best-guess reason a reconciliation missed. Diagnostic only - it never changes a
 * figure, it labels WHY the model and the print diverged so the gap is actionable
 * (fix the input) rather than silently swallowed.
 */
export type ReconciliationCause =
  | "stale_rate_card" // a tested cycle predates the card's effective date
  | "incomplete_intervals" // priced cycles carry ~no usage basis
  | "partial_bill" // exclusions dominate / nothing testable assembled
  | "ocr_noise" // small, mixed-sign per-cycle scatter, no systematic cause
  | "rate_change_straddle" // a cycle spans the 2026-03-01 card change
  | "unknown"; // passes, or a failure with no distinguishable cause

/** One cycle's back-test plus whether it sits inside the per-cycle band. */
export type PerCycleRecord = CycleBackTest & { withinBand: boolean };

/**
 * The per-meter reconciliation. Every cents figure is the deterministic engine's
 * own (computed = card recompute, real = the printed total); this module adds
 * only the comparison, the pass verdict, and the cause label.
 */
export type ReconciliationRecord = {
  meterId: string;
  meterName: string;
  serviceId: string | null;
  rateSchedule: string | null;
  /** Card-recomputed total across tested cycles, integer cents. */
  computedCents: number;
  /** The real printed total across tested cycles, integer cents. */
  realCents: number;
  /** Sum of per-cycle absolute errors, integer cents (cannot cancel). */
  absErrorCents: number;
  /** Aggregate absolute error as percent of printed; null when nothing testable. */
  pctError: number | null;
  /** Within band aggregate AND every cycle within the per-cycle band. */
  pass: boolean;
  cause: ReconciliationCause;
  rateCardVersion: string | null;
  cardEffectiveDate: string;
  /** Spans of the cycles that were actually tested. */
  billDates: { start: string; close: string }[];
  perCycle: PerCycleRecord[];
  /** Cycles dropped before testing, with the reason - visible, never silent. */
  excluded: CycleExclusion[];
};

/** What inferCause needs beyond the record's own numbers. */
export type CycleContext = {
  cardVersion: string | null;
  cardEffectiveDate: string;
  rateChangeBoundaryIso: string;
  excluded: CycleExclusion[];
  /** Total metered kWh across tested cycles (the usage basis). */
  testedKwh: number;
  tolerance: BackTestTolerance;
};

function ms(iso: string): number {
  // App code (not a workflow script): Date parsing of an explicit ISO arg is fine.
  return Date.parse(iso);
}

/**
 * Best-guess cause for a FAILING reconciliation, deterministic and
 * fail-toward-"unknown". Priority order is by how systematically each signal
 * explains a miss: the documented rate-change straddle first, then a card that
 * predates the bill, then a bill too partial to test, then a thin usage basis,
 * then scattered OCR noise, else unknown. Uses ONLY signals already on the record
 * + context; invents nothing.
 */
export function inferCause(
  record: Omit<ReconciliationRecord, "cause">,
  ctx: CycleContext,
): ReconciliationCause {
  const boundaryMs = ms(ctx.rateChangeBoundaryIso);
  if (
    Number.isFinite(boundaryMs) &&
    record.perCycle.some((c) => ms(c.start) < boundaryMs && ms(c.close) > boundaryMs)
  ) {
    return "rate_change_straddle";
  }

  const effectiveMs = ms(ctx.cardEffectiveDate);
  if (
    Number.isFinite(effectiveMs) &&
    record.perCycle.some((c) => ms(c.start) < effectiveMs)
  ) {
    return "stale_rate_card";
  }

  // Nothing testable assembled, or the dropped cycles outnumber the tested ones:
  // the bill was too partial to reconcile.
  if (record.perCycle.length === 0 || ctx.excluded.length > record.perCycle.length) {
    return "partial_bill";
  }

  // Priced cycles with no usage behind them: a customer-charge-only recompute
  // cannot reproduce a real bill.
  if (ctx.testedKwh <= 0) return "incomplete_intervals";

  // Small, mixed-sign scatter with no single cycle blowing the per-cycle band:
  // extraction/OCR noise rather than a structural card gap.
  const devs = record.perCycle.map((c) => c.deviationPct).filter(Number.isFinite);
  const hasPos = devs.some((d) => d > 0);
  const hasNeg = devs.some((d) => d < 0);
  const maxAbs = devs.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
  if (hasPos && hasNeg && maxAbs <= ctx.tolerance.perCycleBandPct) return "ocr_noise";

  return "unknown";
}

/**
 * Assemble the record from an already-computed back-test. Sets pass (aggregate
 * within band AND every cycle within the per-cycle band, and at least one cycle
 * tested) and the cause ("unknown" whenever it passes). Does not re-price.
 */
export function buildReconciliationRecord(args: {
  meter: { id: string; name: string; serviceId: string | null; rateSchedule: string | null };
  backTest: MeterBackTest;
  excluded: CycleExclusion[];
  testedKwh: number;
  cardVersion: string | null;
  cardEffectiveDate: string;
  tolerance: BackTestTolerance;
  rateChangeBoundaryIso?: string;
}): ReconciliationRecord {
  const { meter, backTest, excluded, tolerance } = args;
  const boundary = args.rateChangeBoundaryIso ?? RATE_CHANGE_BOUNDARY_ISO;

  const perCycle: PerCycleRecord[] = backTest.perCycle.map((c) => ({
    ...c,
    withinBand: Math.abs(c.deviationPct) <= tolerance.perCycleBandPct,
  }));

  const pass =
    backTest.testedCycles > 0 &&
    backTest.aggregateDeviationPct !== null &&
    backTest.aggregateDeviationPct <= tolerance.bandPct &&
    perCycle.every((c) => c.withinBand);

  const base: Omit<ReconciliationRecord, "cause"> = {
    meterId: meter.id,
    meterName: meter.name,
    serviceId: meter.serviceId,
    rateSchedule: meter.rateSchedule,
    computedCents: backTest.sumRecomputedCents,
    realCents: backTest.sumPrintedCents,
    absErrorCents: backTest.sumAbsErrorCents,
    pctError: backTest.aggregateDeviationPct,
    pass,
    rateCardVersion: args.cardVersion,
    cardEffectiveDate: args.cardEffectiveDate,
    billDates: backTest.perCycle.map((c) => ({ start: c.start, close: c.close })),
    perCycle,
    excluded,
  };

  const cause: ReconciliationCause = pass
    ? "unknown"
    : inferCause(base, {
        cardVersion: args.cardVersion,
        cardEffectiveDate: args.cardEffectiveDate,
        rateChangeBoundaryIso: boundary,
        excluded,
        testedKwh: args.testedKwh,
        tolerance,
      });

  return { ...base, cause };
}

/**
 * Reconcile ONE meter end to end: build cycles from its periods (the same
 * cycleFromPeriod the lever uses), map its schedule to a card plan, re-price with
 * backTestMeter, and flag the result. A meter whose schedule never maps or whose
 * bills yield no testable cycle still produces a record (testedCycles 0, pass
 * false) - it is recorded as not-testable, never dropped silently.
 *
 * This is the single core both the engine-edge log and the verification harness
 * call, so they compute identical numbers.
 */
export function reconcileMeter(args: {
  meter: { id: string; name: string; serviceId: string | null; rateSchedule: string | null };
  periods: LeverPeriod[];
  card: RateCard;
  tolerance: BackTestTolerance;
  rateChangeBoundaryIso?: string;
}): ReconciliationRecord {
  const { meter, periods, card, tolerance } = args;

  const cycles: LeverCycle[] = [];
  const excluded: CycleExclusion[] = [];
  for (const period of periods) {
    const r = cycleFromPeriod(period, card);
    if ("cycle" in r) cycles.push(r.cycle);
    else excluded.push(r.excluded);
  }

  // The size-tier mapping reads demand off every period (excluded ones included),
  // exactly as the lever does, so the schedule maps to the same card row.
  const maxBilledKw = periods.reduce<number | null>((max, p) => {
    const kw = billedDemandFromLineItems(p.lineItems);
    return kw === null ? max : Math.max(max ?? 0, kw);
  }, null);

  const mapped =
    meter.rateSchedule && meter.rateSchedule.trim() !== ""
      ? mapScheduleLabel(meter.rateSchedule, card, maxBilledKw)
      : null;

  const common = {
    meter,
    excluded,
    cardVersion: card.version ?? null,
    cardEffectiveDate: card.effectiveDate,
    tolerance,
    rateChangeBoundaryIso: args.rateChangeBoundaryIso,
  };

  if (mapped === null || cycles.length === 0) {
    const emptyBackTest: MeterBackTest = {
      testedCycles: 0,
      sumPrintedCents: 0,
      sumRecomputedCents: 0,
      sumAbsErrorCents: 0,
      aggregateDeviationPct: null,
      perCycle: [],
    };
    return buildReconciliationRecord({ ...common, backTest: emptyBackTest, testedKwh: 0 });
  }

  const backTest = backTestMeter(cycles, mapped.plan);
  const testedKwh = cycles.reduce(
    (s, c) =>
      s + (c.energyKwh.peak ?? 0) + (c.energyKwh.partial_peak ?? 0) + (c.energyKwh.off_peak ?? 0),
    0,
  );
  return buildReconciliationRecord({ ...common, backTest, testedKwh });
}
