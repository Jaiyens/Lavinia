// The one stat that reframes the whole pitch: across a grower's reconciled bills, what
// fraction of every dollar is the DEMAND charge, not energy x usage. Growers (and their
// accountants) read a PG&E bill as "rate times kWh". The demand charge is a separate line
// set by a single 15-minute peak, and on irrigation accounts it is a large slice of the
// total - frequently around 40%. Proving that share from the customer's OWN bills is what
// makes the demand visuals land: it is not abstract, it is this much of what you already pay.
//
// Computed, never asserted: sum the demand line cents and the total spend cents across the
// reconciled meters/periods and divide. A meter with no demand charge contributes 0 to the
// numerator and its total to the denominator (honest dilution, not exclusion).
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in demand-share.test.ts.

import type { MeterView } from "@/lib/dashboard/load";

const RECONCILED = "reconciled";

export type DemandShare = {
  /** Summed demand-charge cents across reconciled periods. */
  demandCents: number;
  /** Summed printed-total cents across the same reconciled periods. */
  totalCents: number;
  /** demandCents / totalCents in [0,1], or null when there is no reconciled spend to divide. */
  fraction: number | null;
  /** The same fraction as a whole-number percent (rounded), or null. The headline figure. */
  percent: number | null;
  /** How many reconciled periods (with a printed total) backed the figure. */
  periodsCounted: number;
};

/**
 * Demand charges as a share of total reconciled spend across a meter set. Sums each
 * reconciled period's demand cents (0 when that cycle carried no demand charge) and its
 * printed total; the share is the first over the second. Only periods with a printed total
 * count toward the denominator (an unpriced period proves nothing). Returns a null fraction
 * when nothing reconciled, so callers withhold the stat rather than render a fabricated 0%.
 */
export function demandShare(meters: readonly MeterView[]): DemandShare {
  let demandCents = 0;
  let totalCents = 0;
  let periodsCounted = 0;

  for (const meter of meters) {
    if (meter.coverageState !== RECONCILED) continue;
    for (const period of meter.periods) {
      if (period.printedTotalCents === null) continue;
      totalCents += period.printedTotalCents;
      // A null demand charge means no demand line this cycle: it adds nothing to the
      // numerator but its total still dilutes the share (honest, not cherry-picked).
      demandCents += period.demandCents ?? 0;
      periodsCounted += 1;
    }
  }

  if (totalCents <= 0) {
    return { demandCents, totalCents, fraction: null, percent: null, periodsCounted };
  }

  const fraction = demandCents / totalCents;
  return {
    demandCents,
    totalCents,
    fraction,
    percent: Math.round(fraction * 100),
    periodsCounted,
  };
}
