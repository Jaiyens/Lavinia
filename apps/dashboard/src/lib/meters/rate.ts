// SERVER-ONLY: the demand $/kW lookup for one meter, read from the SAME committed PG&E rate card
// the rest of the app prices against (never a hardcoded $/kW). loadRateCard reads the fixture via
// node:fs, so this module must only ever run on the server - the FEED calls it when building
// snapshots (generate.ts), then the pure, client-safe risk math reads the resolved number off the
// snapshot. A live feed resolves $/kW the same way. Keeping the fs-bound read out of config.ts is
// what lets the client board import the thresholds without dragging node:fs into the browser bundle.

import { loadRateCard } from "@/lib/pge/rate-card";
import { planFor, seasonFor, sizeClassFor } from "@/lib/energy/rates";

/**
 * The max-demand $/kW for one meter: resolve its plan for the cycle's season + size class and
 * return the demand rate PG&E bills on the single highest 15-min kW of the cycle. Falls back to
 * the broad AG-A tier when a meter's schedule is unknown, so the board always shows a real,
 * sourced figure rather than $0.
 */
export function demandDollarsPerKw(args: {
  rateSchedule: string;
  observedPeakKw: number;
  cycleCloseIso: string;
}): number {
  const card = loadRateCard();
  const season = seasonFor(args.cycleCloseIso, card);
  const sizeClass = sizeClassFor(args.observedPeakKw, card);
  const plan =
    planFor(card, args.rateSchedule, sizeClass) ?? planFor(card, "AG-A", sizeClass);
  if (plan === null) return 0;
  const seasonPrices = season === "summer" ? plan.summer : plan.winter;
  return seasonPrices.demand.maxDemandPerKw ?? 0;
}
