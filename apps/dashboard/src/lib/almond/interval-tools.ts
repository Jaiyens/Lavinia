// The interval-data edge for Almond: the three read tools that let the assistant
// look through a meter's actual 15-minute readings instead of only its billing
// summaries. This is the layer that was missing — getFarmOverview/getMeter and the
// rest read pre-computed cycle summaries (loadMetersForFarm, "never the 15-minute
// interval series"), so a question like "when was the largest 15-minute kW interval"
// had no path to an answer. These executors query UsageInterval directly and reduce
// it through the proven pure functions in src/lib/energy (demand.ts, interval-stats.ts).
//
// DECOUPLED ON PURPOSE: takes its own minimal `IntervalToolDeps` ({ prisma, farmId }),
// which `AlmondToolDeps` satisfies structurally, so this file does not import the
// (heavily-edited) tools.ts. The tool({...}) wrappers that hand these to the model live
// in tools.ts; these are the plain executors, unit-testable against a real database.
//
// Scale: queries are per-meter and time-bounded by the optional window; a defensive
// row cap (MAX_INTERVAL_ROWS) guards a pathological all-history pull. Meter resolution
// reuses resolveMeterQuery so a name lands on the SAME meter getMeter would pick (and
// an ambiguous name asks, never guesses).

import type { PrismaClient } from "@prisma/client";
import { resolveMeterQuery } from "@/lib/almond/shape";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { effectiveDemandRate, type DemandPeak } from "@/lib/energy/demand";
import {
  bucketByDayOfWeek,
  bucketByHourOfDay,
  bucketByMonth,
  bucketByTouPeriod,
  summarizeIntervalWindow,
  type IntervalWindowSummary,
  type UsageBucket,
} from "@/lib/energy/interval-stats";
import type { IntervalReading } from "@/lib/energy/types";

/**
 * The minimal dependency surface these executors need. `AlmondToolDeps` (tools.ts) is a
 * structural supertype, so the tool wrappers pass `deps` straight through; keeping the
 * type local decouples this file from the churn in tools.ts.
 */
export type IntervalToolDeps = {
  prisma: PrismaClient;
  farmId: string;
};

/** A half-open time window [from, to) as ISO 8601 strings; both ends optional. */
export type IntervalWindowInput = { from?: string; to?: string };

/** How getMeterIntervalStats groups a meter's readings. */
export type IntervalGroupBy = "hour" | "dayOfWeek" | "month" | "touPeriod";

/**
 * Defensive cap on a single all-history interval pull. Per-meter, per-window the real
 * row count is small (one meter, 15-min data, a year ≈ 35k rows), but an unbounded pull
 * on the heaviest meter must never load unboundedly; the executors flag `truncated` when
 * the cap is hit so the answer can stay honest about the window it actually saw.
 */
const MAX_INTERVAL_ROWS = 200_000;

// --- Meter resolution -----------------------------------------------------------------

/** Resolve a free-form meter reference to a pumpId, exactly as getMeter would. */
export type ResolvedMeter =
  | { kind: "found"; pumpId: string; meterName: string }
  | { kind: "ambiguous"; names: string[] }
  | { kind: "none" };

export async function resolveMeter(deps: IntervalToolDeps, query: string): Promise<ResolvedMeter> {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  const match = resolveMeterQuery(meters, query);
  if (match.kind === "found") {
    return { kind: "found", pumpId: match.meter.id, meterName: match.meter.name };
  }
  if (match.kind === "ambiguous") return { kind: "ambiguous", names: match.names };
  return { kind: "none" };
}

// --- Interval fetch -------------------------------------------------------------------

/** Turn an optional ISO window into a Prisma `start` filter, ignoring unparseable bounds. */
function windowFilter(window?: IntervalWindowInput): { gte?: Date; lt?: Date } | undefined {
  if (!window) return undefined;
  const filter: { gte?: Date; lt?: Date } = {};
  if (window.from) {
    const from = new Date(window.from);
    if (!Number.isNaN(from.getTime())) filter.gte = from;
  }
  if (window.to) {
    const to = new Date(window.to);
    if (!Number.isNaN(to.getTime())) filter.lt = to;
  }
  return filter.gte || filter.lt ? filter : undefined;
}

/** Fetch one meter's readings as IntervalReading[], import + export, capped and ordered. */
async function fetchReadings(
  prisma: PrismaClient,
  pumpId: string,
  window?: IntervalWindowInput,
): Promise<{ readings: IntervalReading[]; truncated: boolean }> {
  const start = windowFilter(window);
  const rows = await prisma.usageInterval.findMany({
    where: { pumpId, ...(start ? { start } : {}) },
    select: { start: true, durationSec: true, kWh: true, direction: true, touCode: true },
    orderBy: { start: "asc" },
    take: MAX_INTERVAL_ROWS,
  });
  const readings: IntervalReading[] = rows.map((row) => ({
    start: row.start.toISOString(),
    durationSec: row.durationSec,
    kWh: row.kWh,
    direction: row.direction === "export" ? "export" : "import",
    touCode: row.touCode,
  }));
  return { readings, truncated: rows.length === MAX_INTERVAL_ROWS };
}

// --- Tool 1: getMeterPeakInterval -----------------------------------------------------

export type MeterPeakIntervalResult =
  | { found: false; reason: "ambiguous"; candidates: string[] }
  | { found: false; reason: "none" }
  | { found: false; reason: "no_data"; meterName: string }
  | {
      found: true;
      meterName: string;
      /** The single highest 15-minute kW and when it occurred (import only). */
      peak: DemandPeak;
      /** The earliest/latest reading actually examined. */
      window: { start: string | null; end: string | null };
      intervalCount: number;
      /** True if the all-history pull hit the row cap (the window is a lower bound). */
      truncated: boolean;
    };

/**
 * The single largest 15-minute kW interval for one meter (and exactly when it happened),
 * optionally within a window. This is the direct answer to "when was my biggest spike /
 * what set the demand charge." Import only — a solar meter's export never wins the peak.
 */
export async function getMeterPeakInterval(
  deps: IntervalToolDeps,
  input: { meter: string; window?: IntervalWindowInput },
): Promise<MeterPeakIntervalResult> {
  const resolved = await resolveMeter(deps, input.meter);
  if (resolved.kind === "ambiguous") {
    return { found: false, reason: "ambiguous", candidates: resolved.names };
  }
  if (resolved.kind === "none") return { found: false, reason: "none" };

  const { readings, truncated } = await fetchReadings(deps.prisma, resolved.pumpId, input.window);
  const summary = summarizeIntervalWindow(readings);
  if (!summary.peak) return { found: false, reason: "no_data", meterName: resolved.meterName };

  return {
    found: true,
    meterName: resolved.meterName,
    peak: summary.peak,
    window: { start: summary.windowStart, end: summary.windowEnd },
    intervalCount: summary.count,
    truncated,
  };
}

// --- Tool 2: getMeterIntervalStats ----------------------------------------------------

export type MeterIntervalStatsResult =
  | { found: false; reason: "ambiguous"; candidates: string[] }
  | { found: false; reason: "none" }
  | { found: false; reason: "no_data"; meterName: string }
  | {
      found: true;
      meterName: string;
      groupBy: IntervalGroupBy;
      buckets: UsageBucket[];
      summary: IntervalWindowSummary;
      window: { start: string | null; end: string | null };
      truncated: boolean;
    };

function bucketFor(groupBy: IntervalGroupBy, readings: readonly IntervalReading[]): UsageBucket[] {
  switch (groupBy) {
    case "hour":
      return bucketByHourOfDay(readings);
    case "dayOfWeek":
      return bucketByDayOfWeek(readings);
    case "month":
      return bucketByMonth(readings);
    case "touPeriod":
      return bucketByTouPeriod(readings);
  }
}

/**
 * A meter's usage grouped to answer a pattern question: which hours run hardest, the
 * weekday shape, the monthly trend, or the on-peak vs off-peak split. Returns compact
 * buckets plus the window summary. Import only.
 */
export async function getMeterIntervalStats(
  deps: IntervalToolDeps,
  input: { meter: string; groupBy: IntervalGroupBy; window?: IntervalWindowInput },
): Promise<MeterIntervalStatsResult> {
  const resolved = await resolveMeter(deps, input.meter);
  if (resolved.kind === "ambiguous") {
    return { found: false, reason: "ambiguous", candidates: resolved.names };
  }
  if (resolved.kind === "none") return { found: false, reason: "none" };

  const { readings, truncated } = await fetchReadings(deps.prisma, resolved.pumpId, input.window);
  const summary = summarizeIntervalWindow(readings);
  if (summary.count === 0) return { found: false, reason: "no_data", meterName: resolved.meterName };

  return {
    found: true,
    meterName: resolved.meterName,
    groupBy: input.groupBy,
    buckets: bucketFor(input.groupBy, readings),
    summary,
    window: { start: summary.windowStart, end: summary.windowEnd },
    truncated,
  };
}

// --- Tool 3: getMeterDemandHistory ----------------------------------------------------

export type DemandCycle = {
  /** Cycle window, ISO 8601. */
  start: string;
  close: string;
  /** The cycle's max-demand peak kW and when it occurred (already derived at bill import). */
  peakKw: number | null;
  peakAt: string | null;
  /** Total demand charge dollars on the bill, and the implied $/kW it sets. */
  demandChargeUsd: number | null;
  impliedDollarsPerKw: number | null;
  tariff: string | null;
};

export type MeterDemandHistoryResult =
  | { found: false; reason: "ambiguous"; candidates: string[] }
  | { found: false; reason: "none" }
  | { found: true; meterName: string; cycles: DemandCycle[] };

/**
 * Per-cycle demand history for one meter, newest first: the peak kW, when in the cycle it
 * occurred, the demand charge, and the $/kW that charge implies (derived from the bill via
 * effectiveDemandRate, never hardcoded). Cheap — reads the already-derived BillingPeriod
 * summary, no interval scan. Empty `cycles` means no demand is on file yet.
 */
export async function getMeterDemandHistory(
  deps: IntervalToolDeps,
  input: { meter: string; limit?: number },
): Promise<MeterDemandHistoryResult> {
  const resolved = await resolveMeter(deps, input.meter);
  if (resolved.kind === "ambiguous") {
    return { found: false, reason: "ambiguous", candidates: resolved.names };
  }
  if (resolved.kind === "none") return { found: false, reason: "none" };

  const rows = await deps.prisma.billingPeriod.findMany({
    where: { pumpId: resolved.pumpId },
    orderBy: { start: "desc" },
    take: input.limit ?? 12,
    select: { start: true, close: true, peakKw: true, peakAt: true, demandChargeUsd: true, tariff: true },
  });

  const cycles: DemandCycle[] = rows.map((row) => ({
    start: row.start.toISOString(),
    close: row.close.toISOString(),
    peakKw: row.peakKw,
    peakAt: row.peakAt ? row.peakAt.toISOString() : null,
    demandChargeUsd: row.demandChargeUsd,
    impliedDollarsPerKw: effectiveDemandRate(row.demandChargeUsd, row.peakKw),
    tariff: row.tariff,
  }));

  return { found: true, meterName: resolved.meterName, cycles };
}
