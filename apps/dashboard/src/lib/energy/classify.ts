// Meter classification: pump vs non-pump, from the usage signature. Pure, no UI,
// no DB. A big, spiky, seasonal load on an agricultural rate is an irrigation pump;
// a small, flat, year-round load on a commercial rate is an office or shop. The
// importer feeds the metered data in; onboarding writes the verdict onto the Pump
// and the farmer can override it in the confirm step. Returns factual `signals`
// (not prose) so src/copy builds the farmer-facing sentence and this layer stays
// locale-free, like the rest of the energy math.

import type { PumpKind } from "@/lib/recommendations/types";
import type { IntervalReading } from "./types";

/** Derived features of a meter's usage, the input to `classifyMeter`. */
export type MeterSignature = {
  /** Highest 15-minute demand seen (kW): the interval peak, raised to the stored
   * cycle peak when that is higher (a short sample can miss the true monthly peak). */
  peakKw: number | null;
  /** Time-weighted average load (kW) across the sampled intervals. */
  avgKw: number | null;
  /**
   * Average / interval-peak in [0,1] on the SAME (interval) basis. Low = spiky
   * (pump-like); high = flat (office-like). Null when the sample cannot reveal
   * shape: too few readings, too short a span to include idle time, or all-idle.
   */
  loadFactor: number | null;
  /** Rate schedule, e.g. "AG-C" or "B-1". */
  tariff: string | null;
  /** How many interval readings backed the signature. */
  readings: number;
};

/** The factual cues behind a verdict; src/copy turns these into a sentence. */
export type ClassificationSignals = {
  peakKw: number | null;
  /** Tariff begins with "AG" (an agricultural rate). */
  isAgTariff: boolean;
  loadFactor: number | null;
  /** Flat baseload (high load factor): looks like an always-on office/shop. */
  flat: boolean;
};

export type Classification = {
  kind: PumpKind;
  /** How sure we are, in [0.5, 0.98]. The confirm step surfaces low confidence. */
  confidence: number;
  signals: ClassificationSignals;
};

// 15-minute kW from an interval's kWh: power = energy / hours.
function intervalKw(r: IntervalReading): number {
  const hours = r.durationSec / 3600;
  return hours > 0 ? r.kWh / hours : 0;
}

// Load factor only tells pump-from-office apart when the sample is wide enough to
// include idle time. A handful of readings in one window cannot, so we withhold the
// shape signal there rather than emit a misleading "flat" or "spiky" verdict.
const MIN_READINGS_FOR_SHAPE = 4;
const MIN_SPAN_HOURS_FOR_SHAPE = 8;

/**
 * Derive a meter's usage signature from its interval series. `cyclePeakKw` (the
 * per-cycle peaks the importer already stored) raises `peakKw` when the interval
 * sample is too thin to show the real peak; `tariff` is the rate schedule. The
 * load-factor (shape) signal is computed from the interval data alone and only when
 * the sample spans enough time to be meaningful (see the gate below).
 */
export function meterSignature(
  intervals: readonly IntervalReading[],
  opts: { tariff?: string | null; cyclePeakKw?: readonly number[] } = {},
): MeterSignature {
  const tariff = opts.tariff ?? null;
  const cyclePeaks = (opts.cyclePeakKw ?? []).filter((p) => Number.isFinite(p));
  const cycleMax = cyclePeaks.length > 0 ? Math.max(...cyclePeaks) : null;

  if (intervals.length === 0) {
    return { peakKw: cycleMax, avgKw: null, loadFactor: null, tariff, readings: 0 };
  }

  let intervalPeak = 0;
  let totalKwh = 0;
  let totalHours = 0;
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = Number.NEGATIVE_INFINITY;
  for (const r of intervals) {
    intervalPeak = Math.max(intervalPeak, intervalKw(r));
    totalKwh += r.kWh;
    totalHours += r.durationSec / 3600;
    const startMs = Date.parse(r.start);
    if (Number.isFinite(startMs)) {
      minStartMs = Math.min(minStartMs, startMs);
      maxEndMs = Math.max(maxEndMs, startMs + r.durationSec * 1000);
    }
  }

  const avgKw = totalHours > 0 ? totalKwh / totalHours : null;
  // Size: the interval peak, raised to the stored cycle peak when that is higher.
  const peakKw = cycleMax !== null ? Math.max(intervalPeak, cycleMax) : intervalPeak;

  // Shape: average / interval-peak on the same basis, only from a wide-enough,
  // non-idle sample. A thin, single-window, or all-zero sample yields no signal.
  const spanHours = Number.isFinite(minStartMs)
    ? (maxEndMs - minStartMs) / 3_600_000
    : 0;
  const shapeReliable =
    intervals.length >= MIN_READINGS_FOR_SHAPE &&
    spanHours >= MIN_SPAN_HOURS_FOR_SHAPE &&
    intervalPeak > 0 &&
    avgKw !== null &&
    avgKw > 0;
  const loadFactor = shapeReliable ? Math.min(avgKw / intervalPeak, 1) : null;

  return { peakKw, avgKw, loadFactor, tariff, readings: intervals.length };
}

// Thresholds. An irrigation motor draws tens of kW even on a small set; an office
// or shop draws single digits. Pumps run in bursts (low load factor); an
// always-on load sits near its own peak (high load factor).
const PUMP_PEAK_KW = 20;
const SMALL_PEAK_KW = 8;
const SPIKY_LOAD_FACTOR = 0.4;
const FLAT_LOAD_FACTOR = 0.6;

function isAg(tariff: string | null): boolean {
  return tariff !== null && tariff.trim().toUpperCase().startsWith("AG");
}

/**
 * Classify a signature as a pump or a non-pump load. Additive score: positive
 * leans pump, negative leans non-pump. An agricultural tariff is close to
 * definitive (you do not get an ag rate for an office); peak size and load-factor
 * shape refine it. Ties fall to non_pump at low confidence so the farmer reviews.
 */
export function classifyMeter(sig: MeterSignature): Classification {
  const agTariff = isAg(sig.tariff);
  const flat = sig.loadFactor !== null && sig.loadFactor >= FLAT_LOAD_FACTOR;

  let score = 0;
  if (agTariff) score += 3;
  if (sig.peakKw !== null) {
    if (sig.peakKw >= PUMP_PEAK_KW) score += 2;
    else if (sig.peakKw < SMALL_PEAK_KW) score -= 2;
  }
  if (sig.loadFactor !== null) {
    if (sig.loadFactor < SPIKY_LOAD_FACTOR) score += 1;
    else if (sig.loadFactor >= FLAT_LOAD_FACTOR) score -= 1;
  }

  const kind: PumpKind = score > 0 ? "pump" : "non_pump";
  const confidence = Math.min(0.5 + 0.08 * Math.abs(score), 0.98);

  return {
    kind,
    confidence: Math.round(confidence * 100) / 100,
    signals: { peakKw: sig.peakKw, isAgTariff: agTariff, loadFactor: sig.loadFactor, flat },
  };
}
