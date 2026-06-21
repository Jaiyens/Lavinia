// The drawer's demand-visuals data layer: given one meter and the rate card, derive every
// number the Demand-spike (Feature A) and the two-rate Proof (Feature B) sections render, so
// the client components stay thin and this stays pure + tested. It leans entirely on the
// shared foundation - load-shape (the representative 15-minute curve), spike (the analysis +
// fix), rate-bill (cyclePriceInputFromPeriod + compareRates) - and on rates.ts for resolving
// schedules. It invents no dollars: shapes come from load-shape (reconciled to the billed
// peak kW), dollars come from rates.ts priced against the billed usage, and the spike's
// demand always reconciles to the billed demand cents.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in spike-detail.test.ts.

import type { MeterView, MeterPeriodView } from "@/lib/dashboard/load";
import { analyzeSpike, type SpikeAnalysis } from "@/lib/energy/spike";
import {
  cyclePriceInputFromPeriod,
  compareRates,
  rateBill,
  type RateComparison,
  type RateBill,
} from "@/lib/energy/rate-bill";
import {
  familyOf,
  sizeClassFor,
  type RateCard,
} from "@/lib/energy/rates";

/** The peak demand is set somewhere in the afternoon-to-evening irrigation window. We do not
 *  have real interval data on the demo account, so the representative peak minute is chosen
 *  DETERMINISTICALLY from the meter+cycle seed within 14:00-18:00 (the hours an almond pump
 *  set stacks against the heat and rolls into the rate peak). 5pm (1020) sits inside PG&E's
 *  5-8pm peak window so an evening peak reads as a peak-window spike; an earlier afternoon
 *  peak reads as an overlap of pumps. Representative, not measured. */
const WINDOW_START_MIN = 14 * 60;
const WINDOW_END_MIN = 18 * 60;
/** Minute-of-day at which the rate peak window opens (5pm). At or past it = peak_window. */
const PEAK_WINDOW_OPEN_MIN = 17 * 60;

/** A small, stable hash of a string -> uint32 (FNV-1a), matching load-shape's seeding. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A representative peak minute in [14:00, 18:00], snapped to the 15-minute grid, chosen
 *  deterministically from the seed so the same meter+cycle always peaks at the same time. */
function representativePeakMinute(seed: string): number {
  const span = WINDOW_END_MIN - WINDOW_START_MIN;
  const offset = hashSeed(seed) % (span + 1);
  const minute = WINDOW_START_MIN + offset;
  return Math.round(minute / 15) * 15;
}

/** A believable 3-pump split for an overlap case, deterministic from the seed: shares sum to
 *  ~1, with one dominant pump (so the staggered new peak is a clear, large single pump and
 *  the saving is real but honest). Representative only - we do not have per-pump meters on
 *  this account; noted so no one reads it as measured. */
function representativePumpSplit(seed: string): { name: string; share: number }[] {
  // Two seeded draws nudge the dominant pump's share within a sane band; the rest divides
  // the remainder. Names are generic ("Pump A/B/C") because the real pump labels are unknown.
  const r = hashSeed(`${seed}:split`);
  const dominant = 0.42 + ((r % 9) / 100); // 0.42..0.50
  const second = (1 - dominant) * 0.58;
  const third = 1 - dominant - second;
  return [
    { name: "Pump A", share: dominant },
    { name: "Pump B", share: second },
    { name: "Pump C", share: third },
  ];
}

/** The latest reconciled period that carries a material demand charge, or null. "Material"
 *  means a demand line of at least 25% of the printed total: the cycle whose bill a single
 *  peak dominated, which is the one worth visualizing. */
export function latestSpikePeriod(meter: MeterView): MeterPeriodView | null {
  // Periods arrive sorted by start ascending; walk newest-first for the latest qualifying one.
  for (let i = meter.periods.length - 1; i >= 0; i -= 1) {
    const p = meter.periods[i];
    if (p === undefined) continue;
    if (p.demandCents === null || p.demandCents <= 0) continue;
    if (p.peakKw === null || p.peakKw <= 0) continue;
    const total = p.printedTotalCents;
    if (total !== null && total > 0 && p.demandCents < total * 0.25) continue;
    return p;
  }
  return null;
}

/** The implied $/kW for a cycle: billed demand dollars over billed peak kW. Never hardcoded. */
function impliedDemandRatePerKw(period: MeterPeriodView): number | undefined {
  if (period.demandCents === null || period.peakKw === null || period.peakKw <= 0) {
    return undefined;
  }
  return period.demandCents / 100 / period.peakKw;
}

export type SpikeDetail = {
  /** The cycle whose demand the spike set (the one being visualized). */
  period: MeterPeriodView;
  /** The full analysis (curve, cause, fix, reconciled to the billed demand). */
  analysis: SpikeAnalysis;
  /** Whether the byPump breakdown is representative (always true for the overlap case here). */
  pumpsAreRepresentative: boolean;
};

/**
 * Build the demand-spike detail for a meter's latest material-demand cycle. Returns null when
 * no such cycle exists (the drawer then omits the section). The cause is chosen from the
 * representative peak minute: a peak at or after 5pm reads as a single run setting the peak
 * inside the rate peak window (fix: shift off-peak); an earlier afternoon peak reads as
 * several pumps overlapping (fix: stagger), modelled with a representative 3-pump split. The
 * curve's max reconciles to the billed peak kW and the analysis demand to the billed demand
 * cents - the bill is truth.
 */
export function buildSpikeDetail(meter: MeterView, period: MeterPeriodView): SpikeDetail {
  const seed = `${meter.id}:${period.close}`;
  const peakAtMinute = representativePeakMinute(seed);
  const isPeakWindow = peakAtMinute >= PEAK_WINDOW_OPEN_MIN;

  const demandCents = period.demandCents ?? 0;
  const peakKw = period.peakKw ?? 0;
  const demandRatePerKw = impliedDemandRatePerKw(period);

  const pumps = isPeakWindow ? undefined : representativePumpSplit(seed);

  const analysis = analyzeSpike({
    peakKw,
    demandCents,
    demandRatePerKw,
    peakAtMinute,
    pumps,
    seed,
  });

  return {
    period,
    analysis,
    pumpsAreRepresentative: analysis.cause === "overlap",
  };
}

/** Convenience: find the latest spike cycle and build its detail in one call, or null. */
export function spikeDetailForMeter(meter: MeterView): SpikeDetail | null {
  const period = latestSpikePeriod(meter);
  if (period === null) return null;
  return buildSpikeDetail(meter, period);
}

/**
 * The standard go-forward agricultural target for a current schedule, used when no rate
 * finding is attached. AG-A (energy only, no demand charge) and AG-B (flat demand) growers
 * with a peaky pump are the classic AG-C (time-of-use with a peak demand charge) candidates;
 * AG-C stays AG-C. Legacy AG-4 -> AG-B, AG-5 -> AG-C mirrors the closed-rate migration. Null
 * when there is no standard move (so the comparison is omitted, never invented).
 */
export function standardAgTarget(currentSchedule: string | null): string | null {
  if (currentSchedule === null) return null;
  const family = familyOf(currentSchedule);
  switch (family) {
    case "AG-A":
      return "AG-C";
    case "AG-B":
      return "AG-C";
    case "AG-4":
      return "AG-B";
    case "AG-5":
      return "AG-C";
    default:
      return null;
  }
}

export type ProofComparison = {
  /** The cycle priced (the latest reconciled one with a priceable input). */
  period: MeterPeriodView;
  /** Current schedule (the bill's family) and the recommended target. */
  fromSchedule: string;
  toSchedule: string;
  /** Same usage, two rates. */
  comparison: RateComparison;
  /** The billed printed total, when present, so the UI can reconcile the current column. */
  billedTotalCents: number | null;
  /** |modelled current total - billed total| / billed, when both exist; for the tolerance note. */
  modelDeltaFraction: number | null;
};

/** Within this fraction, the modelled current bill is treated as matching the billed total
 *  and the billed figure is shown as the current column. Beyond it, the UI notes the model
 *  delta and never shows a number that contradicts the bill. */
export const MODEL_TOLERANCE = 0.1;

/**
 * Build the two-rate proof for a meter: take the latest priceable reconciled cycle, price its
 * EXACT usage under the current family and a recommended target family, and report both bills
 * plus the saving. `recommendedSchedule` (e.g. from the meter's rate finding) wins; otherwise
 * the standard ag target is used. Returns null when there is no priceable cycle, no target, or
 * the card cannot price either schedule at this size - the section is then omitted gracefully,
 * never faked. The model delta against the billed total is reported so the UI can reconcile.
 */
export function buildProofComparison(
  meter: MeterView,
  card: RateCard,
  recommendedSchedule?: string | null,
): ProofComparison | null {
  // Latest reconciled, priceable cycle (newest first).
  for (let i = meter.periods.length - 1; i >= 0; i -= 1) {
    const period = meter.periods[i];
    if (period === undefined) continue;
    const input = cyclePriceInputFromPeriod(period, card);
    if (input === null) continue;

    const fromSchedule = period.tariff ?? meter.rateSchedule;
    if (fromSchedule === null) continue;
    const toSchedule =
      recommendedSchedule !== undefined && recommendedSchedule !== null
        ? recommendedSchedule
        : standardAgTarget(fromSchedule);
    if (toSchedule === null) continue;
    // No comparison to make if the two schedules are the same family (already optimal).
    if (familyOf(fromSchedule) === familyOf(toSchedule)) continue;

    const sizeClass = sizeClassFor(input.maxDemandKw ?? 0, card);
    const comparison = compareRates(input, fromSchedule, toSchedule, sizeClass, card);
    if (comparison === null) continue;

    const billedTotalCents = period.printedTotalCents;
    const modelCurrentCents = comparison.from.breakdown.totalCents;
    const modelDeltaFraction =
      billedTotalCents !== null && billedTotalCents > 0
        ? Math.abs(modelCurrentCents - billedTotalCents) / billedTotalCents
        : null;

    return {
      period,
      fromSchedule: familyOf(fromSchedule),
      toSchedule: familyOf(toSchedule),
      comparison,
      billedTotalCents,
      modelDeltaFraction,
    };
  }
  return null;
}

/** Re-export the priced-bill type so the UI imports one place. */
export type { RateBill, RateComparison };
export { rateBill };
