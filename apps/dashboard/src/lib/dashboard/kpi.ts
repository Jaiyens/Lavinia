// Pure KPI rollups over the canonical MeterView[]. Every dollar figure counts ONLY reconciled
// meters (AR-15: a number renders only when proven; needs_review / no_bill are withheld from the
// sums, never zero-filled) but the full inventory is the coverage denominator. Sparkline series
// and vs-last deltas appear only when there are >=2 comparable points; otherwise they are omitted,
// never faked. No projection, no savings, no overpayment (planner, not live meter). Pure + tested.

import type { MeterView, MeterPeriodView } from "./load";

export type Coverage = { loaded: number; total: number };

export type KpiSpend = {
  cents: number;
  coverage: Coverage;
  /** Farm monthly spend totals (ascending). Sparkline renders only when length >= 2. */
  series: number[];
  /** Latest vs prior month delta in cents; null when < 2 months. Negative = spend fell. */
  deltaCents: number | null;
};

export type KpiDemand =
  | {
      hasDemand: true;
      cents: number;
      series: number[];
      deltaCents: number | null;
    }
  | { hasDemand: false };

export type KpiMover = {
  meterId: string;
  meterName: string;
  latestCents: number;
  priorCents: number;
  /** latest - prior. Negative = this meter's bill fell. */
  deltaCents: number;
} | null;

export type KpiStrip = {
  spend: KpiSpend;
  demand: KpiDemand;
  biggestMover: KpiMover;
};

const RECONCILED = "reconciled";

function latestPeriod(m: MeterView): MeterPeriodView | undefined {
  return m.periods[m.periods.length - 1];
}

/** Year-month bucket key from an ISO date, e.g. "2026-03". */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Sum a per-month map into an ascending series by month key. */
function monthlySeries(byMonth: Map<string, number>): number[] {
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

function lastDelta(series: number[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (last === undefined || prev === undefined) return null;
  return last - prev;
}

/**
 * Labeled monthly PG&E spend (reconciled meters only, AR-15), ascending by month. Powers the
 * Home spend area-chart hero. Each point is a calendar month ("2026-03") and its summed printed
 * total in integer cents. Months with no reconciled bill simply do not appear (never zero-filled).
 */
export function spendByMonth(meters: MeterView[]): { month: string; cents: number }[] {
  const byMonth = new Map<string, number>();
  for (const m of meters) {
    if (m.coverageState !== RECONCILED) continue;
    for (const p of m.periods) {
      if (p.printedTotalCents != null) {
        const k = monthKey(p.close);
        byMonth.set(k, (byMonth.get(k) ?? 0) + p.printedTotalCents);
      }
    }
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, cents]) => ({ month, cents }));
}

export function computeKpiStrip(meters: MeterView[]): KpiStrip {
  const reconciled = meters.filter((m) => m.coverageState === RECONCILED);

  // --- Spend: sum of each reconciled meter's latest-period printed total ---
  let spendCents = 0;
  const spendByMonth = new Map<string, number>();
  let demandTotalCents = 0;
  let anyDemand = false;
  const demandByMonth = new Map<string, number>();

  for (const m of reconciled) {
    const latest = latestPeriod(m);
    if (latest?.printedTotalCents != null) spendCents += latest.printedTotalCents;
    if (latest?.demandCents != null && latest.demandCents > 0) {
      demandTotalCents += latest.demandCents;
    }
    // Series buckets use ALL reconciled periods so the trend has history where it exists.
    for (const p of m.periods) {
      if (p.printedTotalCents != null) {
        const k = monthKey(p.close);
        spendByMonth.set(k, (spendByMonth.get(k) ?? 0) + p.printedTotalCents);
      }
      if (p.demandCents != null && p.demandCents > 0) {
        anyDemand = true;
        const k = monthKey(p.close);
        demandByMonth.set(k, (demandByMonth.get(k) ?? 0) + p.demandCents);
      }
    }
  }

  const spendSeries = monthlySeries(spendByMonth);
  const spend: KpiSpend = {
    cents: spendCents,
    coverage: { loaded: reconciled.length, total: meters.length },
    series: spendSeries,
    deltaCents: lastDelta(spendSeries),
  };

  // --- Demand exposure: honest "no demand charges" when none of the reconciled meters carry one ---
  let demand: KpiDemand;
  if (!anyDemand) {
    demand = { hasDemand: false };
  } else {
    const demandSeries = monthlySeries(demandByMonth);
    demand = {
      hasDemand: true,
      cents: demandTotalCents,
      series: demandSeries,
      deltaCents: lastDelta(demandSeries),
    };
  }

  // --- Biggest mover: largest |latest - prior| among reconciled meters with >= 2 periods ---
  let biggestMover: KpiMover = null;
  for (const m of reconciled) {
    if (m.periods.length < 2) continue;
    const latest = m.periods[m.periods.length - 1];
    const prior = m.periods[m.periods.length - 2];
    if (latest?.printedTotalCents == null || prior?.printedTotalCents == null) continue;
    const deltaCents = latest.printedTotalCents - prior.printedTotalCents;
    if (biggestMover === null || Math.abs(deltaCents) > Math.abs(biggestMover.deltaCents)) {
      biggestMover = {
        meterId: m.id,
        meterName: m.name,
        latestCents: latest.printedTotalCents,
        priorCents: prior.printedTotalCents,
        deltaCents,
      };
    }
  }

  return { spend, demand, biggestMover };
}
