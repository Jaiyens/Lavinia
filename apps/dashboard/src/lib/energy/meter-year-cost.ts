// The crop-year energy edge for cost-per-pound: which reconciled PG&E dollars belong to a crop
// year. It folds the canonical MeterView[] into per-meter integer-cent totals that the pure
// cost engine (crops/cost.ts) allocates across blocks. It mirrors the SAME exclusions kpi.ts
// spendByMonth applies so the two surfaces never disagree about what "real money" is:
//   - a meter that is not reconciled is withheld (AR-15: a number renders only when proven), and
//   - a solar/NEM meter is excluded entirely (its monthly printed total is a NET running balance
//     that settles only at the annual true-up, never a settled monthly spend).
// A billing period counts toward a crop year by its `close` date, so a cycle is attributed to the
// year it closed in. The crop-year WINDOW (which dates count) is a single exported constant so it
// is easy to change later (e.g. to an Aug-Jul almond season) without touching the fold.
//
// PURE: no DB, no Prisma. Input is the already-loaded MeterView[]; output is plain DTOs the engine
// reads. Integer cents throughout; this never computes a per-pound figure.

import { isSolarNemMeter } from "@/lib/energy/solar-meter";
import type { MeterView } from "@/lib/dashboard/load";
import type { MeterYearCost } from "@/lib/crops/cost";

const RECONCILED = "reconciled";

/** A half-open crop-year window [startIso, endIso) over BillingPeriod.close. */
export type CropYearWindow = { startIso: string; endIso: string };

/**
 * The date window that defines a crop year, by BillingPeriod.close. v1 = the calendar year: a
 * period counts toward `cropYear` when it closed on or after Jan 1 of that year and strictly
 * before Jan 1 of the next. Half-open so a Dec-31 close lands in the right year and a Jan-1 close
 * never double-counts. One place to change the season definition later (e.g. an almond crop year
 * that runs Aug -> Jul) without touching meterYearCosts.
 */
export function cropYearWindow(cropYear: number): CropYearWindow {
  return {
    startIso: new Date(Date.UTC(cropYear, 0, 1)).toISOString(),
    endIso: new Date(Date.UTC(cropYear + 1, 0, 1)).toISOString(),
  };
}

/** Per-meter crop-year energy cost plus the coverage denominator the residual line reads. */
export type MeterYearCostResult = {
  /** One entry per non-solar meter that has reconciled spend in the window (others omitted). */
  meterCosts: MeterYearCost[];
  /** Coverage honesty: how many of the farm's meters are reconciled vs total (mirrors kpi.ts). */
  coverage: { metersTotal: number; metersReconciled: number };
};

/**
 * Sum each meter's reconciled, non-solar printed totals whose billing-period `close` falls inside
 * [windowStartIso, windowEndIso). One MeterYearCost per meter with any qualifying spend; a meter
 * with none simply does not appear (never a fabricated zero). Coverage counts the FULL inventory as
 * the denominator (every meter) and how many are reconciled, exactly like computeKpiStrip, so the
 * cost view can show honestly how much of the fleet the energy figure is built from.
 */
export function meterYearCosts(
  meters: readonly MeterView[],
  windowStartIso: string,
  windowEndIso: string,
): MeterYearCostResult {
  const meterCosts: MeterYearCost[] = [];
  let metersReconciled = 0;
  for (const m of meters) {
    if (m.coverageState === RECONCILED) metersReconciled += 1;
    // Same exclusions as kpi.ts spendByMonth: only reconciled, never solar/NEM.
    if (m.coverageState !== RECONCILED || isSolarNemMeter(m)) continue;
    let cents = 0;
    for (const p of m.periods) {
      if (p.printedTotalCents == null) continue;
      // Half-open window on the period CLOSE: [start, end).
      if (p.close >= windowStartIso && p.close < windowEndIso) {
        cents += p.printedTotalCents;
      }
    }
    if (cents !== 0) meterCosts.push({ meterId: m.id, cents });
  }
  return {
    meterCosts,
    coverage: { metersTotal: meters.length, metersReconciled },
  };
}
