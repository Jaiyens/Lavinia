// Per-meter demand-RISK + demand-DOLLAR math. This is the heart of the board and the place
// the single most important concept lives:
//
//   PG&E bills demand on the highest single 15-minute window of the cycle, SEPARATELY PER
//   METER. What matters is not how much a meter draws but how close it is to beating its OWN
//   peak-so-far. The GAP (headroom = peakSoFar - current) closing is the danger, not the
//   absolute kW. A pump at 180 kW that already peaked at 200 is SAFE (ceiling set). A pump at
//   145 kW whose peak-so-far is only 150 and climbing is DANGEROUS.
//
// Every figure here is PER METER. There is no function that takes more than one meter's kW and
// returns a kW - pooling demand across meters would be wrong (group.ts only sums dollars/counts).
//
// Pure: no UI, no DB, no clock. Colocated tests in risk.test.ts.

import { CROSS_PEAK_ASSUMPTION, RISK_CONFIG, type RiskLevel } from "./config";
import type { MeterSnapshot } from "./types";

/** The assessed demand-risk for ONE meter, everything the board + tile need. */
export type MeterRisk = {
  meter: MeterSnapshot;
  /** peakSoFar - current. POSITIVE = room below the ceiling; <= 0 = already at/over the peak. */
  headroomKw: number;
  /** headroomKw / peakSoFar, the band input. Clamped at 0 below (a new peak has no "room"). */
  headroomFraction: number;
  level: RiskLevel;
  /** True when current draw is AT or ABOVE the old peak: a new, costlier peak is being set now. */
  settingNewPeak: boolean;
  /** $/kW for this meter's plan + season (from the shared rate card). */
  dollarsPerKw: number;
  /** The demand charge the cycle has ALREADY locked in: peakSoFar x $/kW (already billed-in). */
  lockedDemandUsd: number;
  /** What it COSTS if this meter beats its peak: the added demand dollars of a believable new
   *  peak above the current ceiling. The board headlines this for the most urgent meter. */
  crossPeakCostUsd: number;
};

/** Map a headroom fraction (+ the new-peak case) to a risk band. A meter at/over its old peak
 *  is the most urgent state and is always "danger". */
export function classifyRisk(headroomFraction: number, settingNewPeak: boolean): RiskLevel {
  if (settingNewPeak) return "danger";
  if (headroomFraction < RISK_CONFIG.dangerFraction) return "danger";
  if (headroomFraction < RISK_CONFIG.warnFraction) return "watch";
  return "safe";
}

/** Assess one meter's demand risk + dollar stakes. Pure; all per-meter. */
export function assessMeter(meter: MeterSnapshot): MeterRisk {
  const peak = Math.max(0, meter.peakSoFarKw);
  const current = Math.max(0, meter.currentKw);
  const headroomKw = peak - current;
  const settingNewPeak = current >= peak;
  // Headroom as a fraction of the ceiling; a zero/over-peak meter has no room (0).
  const headroomFraction = peak > 0 ? Math.max(0, headroomKw) / peak : 0;
  const level = classifyRisk(headroomFraction, settingNewPeak);

  // The feed resolved this from the shared rate card server-side; the risk math stays pure +
  // client-safe by reading the injected number instead of touching the card (node:fs).
  const dollarsPerKw = Math.max(0, meter.dollarsPerKw);

  // Already locked in: the cycle's billed demand is peakSoFar x $/kW (PG&E bills the single
  // highest 15-min kW of the cycle, which is at least peakSoFar today).
  const lockedDemandUsd = peak * dollarsPerKw;

  // Cost of crossing: a believable NEW peak just above the current ceiling. If the meter is
  // already setting a new peak (current >= old peak), the new peak is the current draw plus a
  // small overshoot; otherwise it is the current draw climbing past the old peak plus overshoot.
  // We price the DELTA in demand dollars above what is already locked in.
  const overshoot = 1 + CROSS_PEAK_ASSUMPTION.overshootFraction;
  const projectedNewPeakKw = Math.max(peak, current) * overshoot;
  const crossPeakCostUsd = Math.max(0, (projectedNewPeakKw - peak) * dollarsPerKw);

  return {
    meter,
    headroomKw,
    headroomFraction,
    level,
    settingNewPeak,
    dollarsPerKw,
    lockedDemandUsd,
    crossPeakCostUsd,
  };
}

/** Numeric urgency order so the worst meter sorts first (danger > watch > safe, then by the
 *  dollar consequence of crossing, then by smallest headroom). */
const LEVEL_RANK: Record<RiskLevel, number> = { danger: 0, watch: 1, safe: 2 };

/** Sort risks most-urgent first. Stable, pure (returns a new array). */
export function byUrgency(risks: MeterRisk[]): MeterRisk[] {
  return [...risks].sort((a, b) => {
    if (LEVEL_RANK[a.level] !== LEVEL_RANK[b.level]) {
      return LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    }
    if (b.crossPeakCostUsd !== a.crossPeakCostUsd) {
      return b.crossPeakCostUsd - a.crossPeakCostUsd;
    }
    return a.headroomKw - b.headroomKw;
  });
}

/** The single most urgent meter, or null if there are none. */
export function mostUrgent(risks: MeterRisk[]): MeterRisk | null {
  return byUrgency(risks)[0] ?? null;
}

/** The worst risk LEVEL across a set (a group's indicator = its worst meter, never an average). */
export function worstLevel(risks: MeterRisk[]): RiskLevel {
  return risks.reduce<RiskLevel>((worst, r) => {
    return LEVEL_RANK[r.level] < LEVEL_RANK[worst] ? r.level : worst;
  }, "safe");
}
