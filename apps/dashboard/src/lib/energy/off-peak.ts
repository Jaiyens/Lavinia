// Lever (d): off-peak shifting. A run sitting in the 4-9pm window pays the peak
// premium and feeds the peak-period demand charge. When the set is deferrable,
// flag it to move before 4pm or after 9pm. The saving is bounded by the run's own
// load priced at the bill's peak-demand $/kW (an upper bound, hence "up to") so we
// never overstate it or invent a rate.

import { en } from "@/copy/en";
import type { DraftRecommendation } from "@/lib/recommendations";
import { clipToPeakWindow } from "./peak";
import { pumpTimingDraft, roundUsd } from "./recommend";
import type { PumpRun } from "./types";

export type OffPeakInput = {
  farmId: string;
  runs: readonly PumpRun[];
  timezone: string;
  /** $/kW from the bill's peak-period demand charge. Never hardcoded. */
  rateUsdPerKw: number;
  /** Local "today"; becomes the recs' createdAt. */
  asOf: string;
};

/**
 * One recommendation per deferrable run that lands in the 4-9pm window, proposing
 * a shift to cheaper hours. Non-deferrable runs (frost, heat) are left alone.
 */
export function offPeakRecommendations(
  input: OffPeakInput,
): DraftRecommendation[] {
  const recs: DraftRecommendation[] = [];

  for (const run of input.runs) {
    if (run.deferrable === false) continue;
    const clip = clipToPeakWindow(run, input.timezone);
    if (!clip) continue;

    const impactUsd = roundUsd(run.kw * input.rateUsdPerKw);

    recs.push(
      pumpTimingDraft({
        farmId: input.farmId,
        severity: "watch",
        createdAt: input.asOf,
        situation: en.pumpTiming.offPeak.situation(run.pumpName),
        impactUsd,
        impactNote: en.pumpTiming.offPeak.impact(impactUsd),
        action: {
          kind: "shift_load",
          label: en.pumpTiming.offPeak.action(),
          params: {
            pumpId: run.pumpId,
            runStart: run.start,
            runEnd: run.end,
            peakWindowStart: clip.start,
            peakWindowEnd: clip.end,
            inWindowKw: roundUsd(run.kw),
            ratePerKw: input.rateUsdPerKw,
          },
        },
      }),
    );
  }

  return recs;
}
