// Lever (c): cycle-edge timing. A demand charge is set by the single highest
// spike in the whole cycle, so a fresh peak set in the last days of a cycle is
// paid for across the whole month while only "benefiting" those few days. When a
// pump's cycle closes soon and it has kept this month's peak low, hold deferrable
// sets until the new cycle opens so a necessary spike lands at its start, not its
// edge. Do not set a fresh peak on a nearly-closed cycle.

import { en } from "@/copy/en";
import type { DraftRecommendation } from "@/lib/recommendations";
import { daysToClose } from "./billing";
import { pumpTimingDraft, roundUsd } from "./recommend";

export type CycleEdgeInput = {
  farmId: string;
  pumpId: string;
  pumpName: string;
  /** Cycle close date (YYYY-MM-DD), from the meter-read schedule. */
  cycleClose: string;
  /** Reference "today" (YYYY-MM-DD). */
  asOf: string;
  /** Highest 15-minute kW set so far this cycle. */
  cycleToDatePeakKw: number;
  /** What a normal peak looks like for this pump (historical reference). */
  typicalPeakKw: number;
  /** $/kW from the latest bill (effectiveDemandRate). Never hardcoded. */
  rateUsdPerKw: number;
  /** Fire only when the cycle closes within this many days. Default 3. */
  daysWindow?: number;
  /**
   * "No high peak yet" means the cycle-to-date peak is still below this fraction
   * of the typical peak. Above it, the damage is done and holding won't help.
   * Default 0.8.
   */
  highPeakFraction?: number;
};

/** "June 14" for a YYYY-MM-DD date. */
function dayLabel(date: string): string {
  const monthIndex = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  return en.pumpTiming.dateLabel(monthIndex, day);
}

/**
 * For each pump near its cycle edge that has not yet set a high peak, a "hold
 * deferrable sets" recommendation. The dollars at stake are the fresh demand
 * charge avoided: the gap between the typical peak a full set would set and the
 * low peak held so far, priced at the bill's $/kW. Pumps that are not near close,
 * or that already set a high peak this cycle, produce nothing.
 */
export function cycleEdge(
  inputs: readonly CycleEdgeInput[],
): DraftRecommendation[] {
  const recs: DraftRecommendation[] = [];

  for (const input of inputs) {
    const window = input.daysWindow ?? 3;
    const fraction = input.highPeakFraction ?? 0.8;
    const days = daysToClose(
      input.cycleClose.slice(0, 10),
      input.asOf.slice(0, 10),
    );

    if (days < 0 || days > window) continue; // not near the edge (or past close)
    if (input.cycleToDatePeakKw >= input.typicalPeakKw * fraction) continue; // already spiked
    const avoidableKw = input.typicalPeakKw - input.cycleToDatePeakKw;
    if (avoidableKw <= 0) continue;

    const impactUsd = roundUsd(avoidableKw * input.rateUsdPerKw);

    recs.push(
      pumpTimingDraft({
        farmId: input.farmId,
        severity: "watch",
        createdAt: input.asOf,
        situation: en.pumpTiming.cycleEdge.situation(input.pumpName, days),
        impactUsd,
        impactNote: en.pumpTiming.cycleEdge.impact(impactUsd),
        action: {
          kind: "hold_sets",
          label: en.pumpTiming.cycleEdge.action(dayLabel(input.cycleClose)),
          params: {
            pumpId: input.pumpId,
            cycleClose: input.cycleClose,
            daysToClose: days,
            currentPeakKw: roundUsd(input.cycleToDatePeakKw),
            typicalPeakKw: roundUsd(input.typicalPeakKw),
            avoidableKw: roundUsd(avoidableKw),
            ratePerKw: input.rateUsdPerKw,
          },
        },
      }),
    );
  }

  return recs;
}
