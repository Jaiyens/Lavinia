// The demand-spike analysis. Powers the "this 15-minute window set $X; here is the fix
// and the new number" surface: one expensive interval drove the cycle's demand charge,
// and there is a concrete operational change that lowers it. Two causes, two fixes:
//   - overlap: several pumps ran at the same hour and stacked into one peak. Stagger them
//     so they never overlap and the new peak is just the largest single pump.
//   - peak_window: a single run set the peak inside the 5-8pm rate peak window. Shift it
//     off-peak and the avoidable peak-period component falls away.
// Reconciliation law: the analyzed peak's demandCents ALWAYS equals the billed demandCents
// passed in (the bill is truth; we never invent a curve that contradicts it). The new
// number is derived from the SAME $/kW the bill implies (demandCents/peakKw), never a
// hardcoded rate.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in spike.test.ts.

import {
  synthesizeDay,
  synthesizeStackedDay,
  staggeredPeakKw,
  type IntervalPoint,
} from "./load-shape";

/** A concrete fix for a demand spike and the new demand number it produces. */
export type SpikeFix = {
  kind: "stagger" | "shift_offpeak";
  /** Operator-English action line (no em dashes, no exclamation marks). */
  label: string;
  /** The demand peak kW after the fix. */
  newPeakKw: number;
  /** The demand charge in integer cents after the fix. */
  newDemandCents: number;
  /** Billed demand cents minus the post-fix demand cents (the saving). */
  saveCents: number;
};

/** The full spike analysis: where the peak landed, what it cost, what caused it, the
 *  representative curve(s) that illustrate it, and the recommended fix. */
export type SpikeAnalysis = {
  peakIndex: number;
  peakMinute: number;
  peakKw: number;
  /** Reconciles EXACTLY to the billed demand cents passed in. */
  demandCents: number;
  /** $/kW the bill implies (passed in, or derived as demandCents/peakKw). */
  demandRatePerKw: number;
  cause: "overlap" | "peak_window";
  combined: IntervalPoint[];
  /** Present only for the overlap case (the per-pump breakdown). */
  byPump?: { name: string; points: IntervalPoint[] }[];
  fix: SpikeFix;
};

/**
 * Representative drop a single peak-window run achieves by shifting off-peak: the load
 * still runs, just not stacked into the 5-8pm peak interval, so the off-peak max it
 * leaves behind is a fraction of the original peak. 0.6 is a believable residual (the
 * pump's off-peak duty cycle), tunable later from real interval data.
 */
const OFFPEAK_RESIDUAL_FRACTION = 0.6;

/** Round a kW to three decimals (the cent of a kW), matching load-shape's grid. */
function roundKw(kw: number): number {
  return Math.round(kw * 1000) / 1000;
}

/**
 * Analyze one demand spike. If `pumps.length > 1` the cause is overlap: build the stacked
 * day (pumps overlapping at the peak minute so the combined max is peakKw) and recommend
 * staggering them, whose new peak is the largest single pump's contribution. Otherwise
 * the cause is a single load setting the peak inside the rate peak window: build the
 * single-load day and recommend shifting it off-peak, whose new peak is a representative
 * off-peak residual of the original.
 *
 * The analyzed peak's `demandCents` always equals the passed-in billed `demandCents`
 * (reconcile, never invent). The $/kW is the caller's `demandRatePerKw` when given, else
 * derived as demandCents / peakKw (never hardcoded); the post-fix demand cents are that
 * same $/kW applied to the new peak.
 */
export function analyzeSpike(opts: {
  peakKw: number;
  demandCents: number;
  demandRatePerKw?: number;
  peakAtMinute?: number;
  pumps?: { name: string; share: number }[];
  seed: string;
}): SpikeAnalysis {
  const peakKw = opts.peakKw;
  const demandCents = opts.demandCents;
  // Derive $/kW from the bill when the caller does not pass it: the implied rate is the
  // billed demand cents over the billed peak kW (dollars per kW). Never hardcode a rate.
  const demandRatePerKw =
    opts.demandRatePerKw !== undefined && Number.isFinite(opts.demandRatePerKw)
      ? opts.demandRatePerKw
      : peakKw > 0
        ? demandCents / 100 / peakKw
        : 0;

  const pumps = opts.pumps ?? [];

  if (pumps.length > 1) {
    // Overlap: pumps stacked at the same minute. Stagger them apart.
    const stacked = synthesizeStackedDay({
      peakKw,
      peakAtMinute: opts.peakAtMinute,
      pumps,
      seed: opts.seed,
    });
    const newPeakKw = staggeredPeakKw(pumps, peakKw);
    const newDemandCents = Math.round(newPeakKw * demandRatePerKw * 100);
    const fix: SpikeFix = {
      kind: "stagger",
      label: `Stagger the ${pumps.length} pumps so they do not overlap`,
      newPeakKw: roundKw(newPeakKw),
      newDemandCents,
      saveCents: demandCents - newDemandCents,
    };
    return {
      peakIndex: stacked.peakIndex,
      peakMinute: stacked.peakIndex * 15,
      peakKw,
      demandCents,
      demandRatePerKw,
      cause: "overlap",
      combined: stacked.combined,
      byPump: stacked.byPump,
      fix,
    };
  }

  // Peak window: a single run set the peak inside the 5-8pm rate peak window. The
  // avoidable component is the peak-window demand; shifting the run off-peak leaves a
  // representative off-peak residual.
  const day = synthesizeDay({
    peakKw,
    peakAtMinute: opts.peakAtMinute,
    seed: opts.seed,
  });
  const newPeakKw = roundKw(peakKw * OFFPEAK_RESIDUAL_FRACTION);
  const newDemandCents = Math.round(newPeakKw * demandRatePerKw * 100);
  const fix: SpikeFix = {
    kind: "shift_offpeak",
    label: "Shift this run off the 5 to 8pm peak window",
    newPeakKw,
    newDemandCents,
    saveCents: demandCents - newDemandCents,
  };
  return {
    peakIndex: day.peakIndex,
    peakMinute: day.peakIndex * 15,
    peakKw,
    demandCents,
    demandRatePerKw,
    cause: "peak_window",
    combined: day.points,
    fix,
  };
}
