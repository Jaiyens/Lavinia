// The pure, testable core of the solar-watch agent: turn a solar-paired meter's printed NEM
// reconciliation months (NemPeriod) into a monthly GENERATION PROXY series, then decide
// whether that array looks like it is slowly UNDERPERFORMING season over season.
//
// HONEST SCOPE (read this before trusting a flag):
//   - The signal is a NET-EXPORT proxy, NOT metered panel output. NemPeriod.netKwh is the
//     meter's NET position for the month (negative = net export); we read the export side as
//     a stand-in for "how much the array put out". It is confounded by on-farm consumption
//     (a pump that ran more this July nets less export even with a perfectly healthy array),
//     so this detects only a SLOW, SEASON-OVER-SEASON shortfall, never a real-time outage or
//     soiling event. Real-time outage/soiling detection needs 15-minute generation intervals
//     plus an irradiance (weather) model that does NOT exist on this base. That is future work.
//   - We compare each month against the SAME calendar month a year earlier (July vs July), so
//     the seasonal sun curve cancels out and we are left with a like-for-like change. A single
//     bad month is never a flag; we require a sustained shortfall across several paired months.
//   - With fewer than MIN_EVIDENCE_MONTHS of usable export months we emit NOTHING (silent).
//     We never fabricate a generation number or a flag from thin evidence.
//
// Pure: no DB, no clock, no fs, no UI. loadArrayGenerationSeries is the thin DB read that
// feeds these pure functions; everything that decides a flag is pure and colocated-tested.

import type { PrismaClient } from "@prisma/client";

/**
 * Minimum number of usable EXPORT months on file before we will consider a flag. Six months
 * is the floor the feature spec sets: enough to have at least one same-month-last-year pair
 * and a few of them, so a flag rests on a trend and not on one anomaly. Below this we are
 * silent.
 */
export const MIN_EVIDENCE_MONTHS = 6;

/**
 * Minimum number of like-for-like (same calendar month, year apart) PAIRS that must show a
 * clear shortfall before we flag. Requiring at least two paired months means a flag reflects
 * a season-over-season pattern, not a single off July.
 */
export const MIN_SHORTFALL_PAIRS = 2;

/**
 * The shortfall margin: a paired month counts as "down" only when this year's export is at
 * least this fraction BELOW last year's for the same calendar month. A conservative 12% clears
 * ordinary year-to-year weather and consumption noise; we would rather miss a marginal decline
 * than cry wolf. Pinned by tests, never an inline magic number.
 */
export const SHORTFALL_FRACTION = 0.12;

/** One month of the generation proxy for a single meter/array, keyed by calendar month. */
export type GenerationMonth = {
  /** Calendar-month identity, the first 7 chars of the period start ISO ("2025-07"). */
  month: string;
  /** 4-digit calendar year parsed from `month` (e.g. 2025). */
  year: number;
  /** 1-12 calendar month parsed from `month` (e.g. 7 for July). */
  monthOfYear: number;
  /**
   * Export proxy for the month, in kWh, as a POSITIVE magnitude. NemPeriod.netKwh is negative
   * when the array net-exported; we flip the sign so "more generation" reads as a bigger number.
   * A month that net-CONSUMED (netKwh >= 0) carries 0 export, which is not usable evidence of
   * array output and is excluded from the flag math.
   */
  exportKwh: number;
};

/** One like-for-like comparison: the same calendar month one year apart. */
export type YearOverYearPair = {
  monthOfYear: number;
  priorYear: number;
  priorExportKwh: number;
  laterYear: number;
  laterExportKwh: number;
  /** Fraction below the prior year (0.2 = 20% lower). Negative when this year is HIGHER. */
  shortfallFraction: number;
};

/** The decision the agent acts on for one meter/array. Never fabricated: null inputs -> no flag. */
export type AgingArrayFlag = {
  /** How many usable export months backed the decision (always >= MIN_EVIDENCE_MONTHS when flagged). */
  monthsCounted: number;
  /** The year-over-year pairs that showed a clear shortfall (always >= MIN_SHORTFALL_PAIRS when flagged). */
  shortfallPairs: YearOverYearPair[];
  /**
   * The worst single-month shortfall fraction across the flagged pairs (the headline number,
   * still a proxy). 0.2 means one paired month was 20% below the year before.
   */
  worstShortfallFraction: number;
};

/** Raw NEM month as it sits in the DB read (mirrors NemPeriod's quotable columns). */
export type NemPeriodLike = {
  /** ISO 8601 period start. */
  start: string;
  /** Net metered kWh for the month; negative = net export. */
  netKwh: number;
};

/**
 * Derive the monthly generation PROXY series from a meter's printed NEM months.
 *
 * Steps, each chosen to keep the proxy honest:
 *   - Dedupe on the calendar month (first 7 chars of the start): real statements reprint a
 *     month with off-by-a-day starts, and a double-counted month would corrupt the trend.
 *   - Keep ONLY net-export months (netKwh < 0), flipping the sign to a positive exportKwh. A
 *     net-consumer month carries no usable generation evidence (it is dominated by load), so
 *     it is dropped rather than counted as "zero generation".
 *   - Sort ascending by month so the year-over-year pairing below is stable.
 *
 * Pure. Returns [] when no months net-exported (silent, never a fabricated series).
 */
export function deriveMonthlyGenerationFromNemPeriods(
  months: readonly NemPeriodLike[],
): GenerationMonth[] {
  const byMonth = new Map<string, GenerationMonth>();
  for (const m of months) {
    const month = m.start.slice(0, 7);
    if (month.length !== 7) continue; // not an ISO date we can bucket; skip rather than guess
    if (byMonth.has(month)) continue; // first row for a calendar month wins (dedupe)
    // Only a net-export month is evidence of generation. netKwh >= 0 means the meter net-CONSUMED;
    // that is load, not array output, so we do not record it.
    if (m.netKwh >= 0) {
      // Still mark the month as seen so a later duplicate row does not slip past the dedupe.
      byMonth.set(month, { month, year: 0, monthOfYear: 0, exportKwh: 0 });
      continue;
    }
    const year = Number.parseInt(month.slice(0, 4), 10);
    const monthOfYear = Number.parseInt(month.slice(5, 7), 10);
    if (!Number.isFinite(year) || !Number.isFinite(monthOfYear)) continue;
    byMonth.set(month, { month, year, monthOfYear, exportKwh: Math.abs(m.netKwh) });
  }
  return [...byMonth.values()]
    .filter((g) => g.exportKwh > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Pair each month against the SAME calendar month one year earlier and compute the shortfall.
 * Comparing July-to-July cancels the seasonal sun curve, so a real decline (a slowly aging or
 * partially shaded array) shows through while ordinary seasonality does not. Months without a
 * prior-year partner simply produce no pair. Pure.
 */
export function pairYearOverYear(series: readonly GenerationMonth[]): YearOverYearPair[] {
  const byKey = new Map<string, GenerationMonth>();
  for (const g of series) byKey.set(`${g.year}-${g.monthOfYear}`, g);

  const pairs: YearOverYearPair[] = [];
  for (const later of series) {
    const prior = byKey.get(`${later.year - 1}-${later.monthOfYear}`);
    if (prior === undefined) continue;
    if (prior.exportKwh <= 0) continue; // cannot form a ratio against zero
    const shortfallFraction = (prior.exportKwh - later.exportKwh) / prior.exportKwh;
    pairs.push({
      monthOfYear: later.monthOfYear,
      priorYear: prior.year,
      priorExportKwh: prior.exportKwh,
      laterYear: later.year,
      laterExportKwh: later.exportKwh,
      shortfallFraction,
    });
  }
  return pairs;
}

/**
 * Decide whether a meter's array looks like it is slowly underperforming. Conservative and
 * fail-quiet:
 *   - Fewer than MIN_EVIDENCE_MONTHS usable export months -> null (silent, never fabricate).
 *   - Need at least MIN_SHORTFALL_PAIRS year-over-year pairs each at or beyond SHORTFALL_FRACTION
 *     below the prior year -> only then a flag, with the worst pair as the headline.
 *
 * This is the conservative shortfall-vs-expected flag the feature spec asked us to compute
 * ourselves (the named precedent src/lib/energy/solar-degradation.ts / agingArrayFlag does NOT
 * exist on this base). Pure.
 */
export function agingArrayFlag(series: readonly GenerationMonth[]): AgingArrayFlag | null {
  if (series.length < MIN_EVIDENCE_MONTHS) return null;

  const pairs = pairYearOverYear(series);
  const shortfallPairs = pairs.filter((p) => p.shortfallFraction >= SHORTFALL_FRACTION);
  if (shortfallPairs.length < MIN_SHORTFALL_PAIRS) return null;

  const worstShortfallFraction = shortfallPairs.reduce(
    (worst, p) => (p.shortfallFraction > worst ? p.shortfallFraction : worst),
    0,
  );
  return {
    monthsCounted: series.length,
    shortfallPairs,
    worstShortfallFraction,
  };
}

/** One solar-paired meter's generation evidence, ready for the aging decision. */
export type ArrayGenerationSeries = {
  pumpId: string;
  pumpName: string;
  solarKw: number;
  series: GenerationMonth[];
};

/**
 * The thin DB read: load every SOLAR-PAIRED meter on a farm (solarKw not null) together with
 * its printed NEM months, and derive each meter's generation proxy series.
 *
 * ADAPTATION NOTE (reported): NemPeriod is persisted PER METER (Pump.nemPeriods), and the
 * Array -> benefiting-Meter graph (SolarArray, relation "NemAllocation") is sparse and not the
 * carrier of the printed monthly net position. So the evidence-bearing unit here is the
 * solar-paired METER, which is what carries netKwh. We surface one series per solar meter; if
 * an array ever spans several meters, each meter's series is judged on its own (a conservative
 * choice that never blends two meters' confounders together). Farm-scoped by `farmId`.
 */
export async function loadArrayGenerationSeries(
  prisma: PrismaClient,
  farmId: string,
): Promise<ArrayGenerationSeries[]> {
  const meters = await prisma.pump.findMany({
    where: { farmId, solarKw: { not: null } },
    select: {
      id: true,
      name: true,
      solarKw: true,
      nemPeriods: {
        select: { start: true, netKwh: true },
        orderBy: { start: "asc" },
      },
    },
  });

  return meters.map((m) => ({
    pumpId: m.id,
    pumpName: m.name,
    // solarKw is non-null by the query filter, but TS sees the column as nullable; coalesce
    // defensively (0) rather than assert, so a surprise null never crashes the sweep.
    solarKw: m.solarKw ?? 0,
    series: deriveMonthlyGenerationFromNemPeriods(
      m.nemPeriods.map((p) => ({ start: p.start.toISOString(), netKwh: p.netKwh })),
    ),
  }));
}
