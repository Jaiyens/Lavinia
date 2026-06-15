// Lever 1 (the headline): rate optimization. 183 meters on a mix of legacy and
// current rates almost guarantees some are on the wrong one, at zero operational
// change. This engine turns a meter's real interval history + posted bills into a
// bucketed usage profile, models the current bill from the published rate card to
// PROVE it can reproduce what the farmer actually paid, then prices the same usage
// on every eligible alternative and reports the cheapest. The honesty check is the
// load-bearing part: if the model can't reproduce the real bills within tolerance,
// it refuses to make the "switch and save $X" claim.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in rate-compare.test.ts.

import { en } from "@/copy/en";
import { draftRecommendation } from "@/lib/recommendations";
import type { DraftRecommendation } from "@/lib/recommendations";
import { intervalKw } from "./demand";
import { isInPeakWindow } from "./peak";
import { roundUsd } from "./recommend";
import {
  annualCostUnderRate,
  planFor,
  seasonFor,
  sizeClassFor,
  type CycleUsage,
  type MeterUsageProfile,
  type RatePlan,
  type RateCard,
} from "./rates";
import type { CycleBill, IntervalReading } from "./types";

/** The `tool` tag on every recommendation this module emits. */
export const RATE_OPTIMIZATION_TOOL = "rate-optimization";

const MS_PER_DAY = 86_400_000;

/** Normalize a window bound to a full ISO instant; a date-only spans the whole day. */
function startBound(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso).getTime();
}
function endBound(iso: string): number {
  if (iso.length !== 10) return new Date(iso).getTime();
  // A date-only close means "through the close day": include it whole.
  return new Date(`${iso}T00:00:00.000Z`).getTime() + MS_PER_DAY;
}

/**
 * Bucket one cycle's intervals into TOU energy + the billed peaks. v1 uses two TOU
 * buckets: peak (4-9pm local) and off-peak (everything else); partial_peak stays 0
 * until a partial-peak window is modeled. Max demand is the highest 15-min kW in
 * the cycle, floored by the bill's stored peak so a thin sample never understates
 * it (same trick classify.ts uses). Peak-window demand is the highest in-window kW.
 *
 * LEGACY DEMO PATH ONLY: this 4-9pm bucketing predates src/lib/energy/tou.ts and
 * conflates the DR event window with the rate peak (5-8pm per AR-14). The 3.3
 * lever rebuild replaces this interval path with cycle-level priceCycleCents and
 * the tou.ts clocks; do not extend this window.
 */
function bucketCycle(
  intervals: readonly IntervalReading[],
  bill: CycleBill,
  timezone: string,
  card: RateCard,
): CycleUsage {
  const lo = startBound(bill.start);
  const hi = endBound(bill.close);
  let peakKwh = 0;
  let offKwh = 0;
  let maxKw = 0;
  let windowMaxKw = 0;
  for (const iv of intervals) {
    const t = new Date(iv.start).getTime();
    if (t < lo || t >= hi) continue;
    const kw = intervalKw(iv);
    maxKw = Math.max(maxKw, kw);
    if (isInPeakWindow(iv.start, timezone)) {
      peakKwh += iv.kWh;
      windowMaxKw = Math.max(windowMaxKw, kw);
    } else {
      offKwh += iv.kWh;
    }
  }
  return {
    start: bill.start,
    close: bill.close,
    season: seasonFor(bill.start, card),
    energyKwh: { peak: peakKwh, partial_peak: 0, off_peak: offKwh },
    maxDemandKw: Math.max(maxKw, bill.peakKw ?? 0),
    peakWindowDemandKw: windowMaxKw,
  };
}

/** Build a meter's usage profile from its interval history and posted bills. */
export function bucketUsage(
  intervals: readonly IntervalReading[],
  bills: readonly CycleBill[],
  timezone: string,
  card: RateCard,
): MeterUsageProfile {
  const cycles = bills.map((b) => bucketCycle(intervals, b, timezone, card));
  const observedPeakKw = cycles.reduce((m, c) => Math.max(m, c.maxDemandKw), 0);
  return { cycles, observedPeakKw };
}

export type RateOptimizationInput = {
  farmId: string;
  pumpId: string;
  pumpName: string;
  /** The meter's current rate (Pump.rateSchedule), e.g. "AG-C" or "AG-4". */
  currentSchedule: string;
  profile: MeterUsageProfile;
  /** Sum of the meter's actual billed totals (BillingPeriod.totalBillUsd). */
  actualAnnualBillUsd: number;
  card: RateCard;
  /** Local "today"; becomes the rec's createdAt. */
  asOf: string;
  /** Bill-reproduction tolerance for an "act" claim. Default 0.10 (±10%). */
  tolerance?: number;
  /** Savings floor for a material finding. Default $200/yr. */
  minSavingsUsd?: number;
  /** Savings must also clear this fraction of the bill. Default 0.03 (3%). */
  minSavingsFraction?: number;
};

export type RateOptimizationResult = {
  currentSchedule: string;
  bestSchedule: string | null;
  modeledCurrentUsd: number;
  modeledBestUsd: number | null;
  actualUsd: number;
  /** |modeled - actual| / actual: how well we reproduced the real bill. */
  reproductionError: number;
  withinTolerance: boolean;
  savingsUsd: number;
  recommendation: DraftRecommendation | null;
};

/** Candidate target rates: same size class, agricultural, open (non-legacy), a different family. */
function eligibleTargets(
  card: RateCard,
  current: RatePlan,
): RatePlan[] {
  return card.plans.filter(
    (p) =>
      p.agricultural &&
      !p.legacy &&
      p.sizeClass === current.sizeClass &&
      p.family !== current.family,
  );
}

/** Whole-percent reproduction error for the trust line. */
function errorPct(reproductionError: number): number {
  return Math.round(reproductionError * 100);
}

/**
 * Compare a meter's current rate against every eligible alternative on its own
 * usage, gated by a bill-reproduction check. Returns the modeled numbers and, when
 * the finding is trustworthy and material, a DraftRecommendation to switch.
 */
export function rateOptimization(
  input: RateOptimizationInput,
): RateOptimizationResult {
  const tolerance = input.tolerance ?? 0.1;
  const minSavingsUsd = input.minSavingsUsd ?? 200;
  const minSavingsFraction = input.minSavingsFraction ?? 0.03;

  const sizeClass = sizeClassFor(input.profile.observedPeakKw, input.card);
  const currentPlan = planFor(input.card, input.currentSchedule, sizeClass);

  // Non-ag or unknown rate: this engine has nothing to say.
  if (!currentPlan || !currentPlan.agricultural) {
    return {
      currentSchedule: input.currentSchedule,
      bestSchedule: null,
      modeledCurrentUsd: 0,
      modeledBestUsd: null,
      actualUsd: input.actualAnnualBillUsd,
      reproductionError: Infinity,
      withinTolerance: false,
      savingsUsd: 0,
      recommendation: null,
    };
  }

  const modeledCurrentUsd = annualCostUnderRate(input.profile, currentPlan);
  const reproductionError =
    input.actualAnnualBillUsd > 0
      ? Math.abs(modeledCurrentUsd - input.actualAnnualBillUsd) /
        input.actualAnnualBillUsd
      : Infinity;
  const withinTolerance = reproductionError <= tolerance;

  // Price the same usage on every eligible alternative; keep the cheapest.
  let best: { plan: RatePlan; usd: number } | null = null;
  for (const plan of eligibleTargets(input.card, currentPlan)) {
    const usd = annualCostUnderRate(input.profile, plan);
    if (best === null || usd < best.usd) best = { plan, usd };
  }

  const savingsUsd = best ? roundUsd(modeledCurrentUsd - best.usd) : 0;
  const material =
    savingsUsd >= minSavingsUsd &&
    savingsUsd >= modeledCurrentUsd * minSavingsFraction;

  let recommendation: DraftRecommendation | null = null;
  if (best && material) {
    const to = best.plan.family;
    const from = currentPlan.family;
    const pct = errorPct(reproductionError);
    // Out of tolerance: keep the estimate but demote it and label it rough.
    const severity = withinTolerance ? "act" : "info";
    const impactNote = withinTolerance
      ? en.rateOptimization.impact(to)
      : en.rateOptimization.lowConfidence(pct);

    recommendation = draftRecommendation({
      tool: RATE_OPTIMIZATION_TOOL,
      farmId: input.farmId,
      severity,
      createdAt: input.asOf,
      situation: en.rateOptimization.situation(input.pumpName, from),
      impactUsd: savingsUsd,
      impactNote,
      action: {
        kind: "switch_rate",
        label: en.rateOptimization.action(to),
        params: {
          pumpId: input.pumpId,
          pumpName: input.pumpName,
          fromSchedule: from,
          toSchedule: to,
          sizeClass,
          modeledCurrentUsd,
          modeledBestUsd: best.usd,
          actualUsd: input.actualAnnualBillUsd,
          reproductionError: roundUsd(reproductionError),
          withinTolerance,
        },
        // v1 displays only; the agentic OS later files the rate change here.
        execute: null,
      },
    });
  }

  return {
    currentSchedule: input.currentSchedule,
    bestSchedule: best ? best.plan.family : null,
    modeledCurrentUsd,
    modeledBestUsd: best ? best.usd : null,
    actualUsd: input.actualAnnualBillUsd,
    reproductionError,
    withinTolerance,
    savingsUsd,
    recommendation,
  };
}
