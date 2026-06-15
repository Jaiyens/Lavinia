import type { MeterView } from "@/lib/dashboard/load";
import type { KpiStrip } from "@/lib/dashboard/kpi";
import type { FindingView } from "@/lib/dashboard/findings";
import { formatUsdWhole } from "@/lib/format/money";

/**
 * Pure shaping for the Almond tool layer. Tools (src/lib/almond/tools.ts) load the farm's
 * data via the existing dashboard loaders, then hand it here to be turned into SMALL, plain
 * objects the model can read. Keeping this pure (no Prisma, no I/O) makes the trust surface
 * testable: every number Almond reports originates in one of these shapes, scoped to one farm.
 *
 * Money is carried as both integer cents and a whole-dollar string (the model should quote the
 * string; cents are there if it needs to compare). Never cent precision on the surface.
 */

export type MoneyView = { cents: number; usd: string };

function money(cents: number): MoneyView {
  return { cents, usd: formatUsdWhole(cents) };
}

/** A delta carries an explicit direction so the model never has to infer sign from a number
 *  (a spend that FELL must not read as an increase). `usd` is the absolute amount; `direction`
 *  tells the story. */
export type SignedMoneyView = { cents: number; usd: string; direction: "up" | "down" | "flat" };

function signedMoney(cents: number): SignedMoneyView {
  return {
    cents,
    usd: formatUsdWhole(Math.abs(cents)),
    direction: cents > 0 ? "up" : cents < 0 ? "down" : "flat",
  };
}

/** The bucket label for meters with no rate schedule on file. */
export const UNKNOWN_RATE = "(unknown)";

export type FarmOverview = {
  farmName: string;
  meterCount: number;
  solarMeterCount: number;
  /** Distinct KNOWN rate schedules in use, most common first (the no-rate bucket is excluded). */
  rateSchedules: string[];
  /** Null when no billing month has loaded yet (never a misleading "$0"). */
  latestMonthSpend: MoneyView | null;
  spendDeltaVsPriorMonth: SignedMoneyView | null;
  latestDemandCharge: MoneyView | null;
  biggestMover:
    | { meterName: string; latest: MoneyView; prior: MoneyView; delta: SignedMoneyView }
    | null;
};

export function summarizeFarmOverview(
  farmName: string,
  meters: MeterView[],
  kpi: KpiStrip,
): FarmOverview {
  const demand = kpi.demand;
  const mover = kpi.biggestMover;
  return {
    farmName,
    meterCount: meters.length,
    solarMeterCount: meters.filter((m) => m.isSolar).length,
    rateSchedules: rateSchedulesByFrequency(meters)
      .map((r) => r.rate)
      .filter((rate) => rate !== UNKNOWN_RATE),
    latestMonthSpend: kpi.spend.coverage.loaded === 0 ? null : money(kpi.spend.cents),
    spendDeltaVsPriorMonth:
      kpi.spend.deltaCents === null ? null : signedMoney(kpi.spend.deltaCents),
    latestDemandCharge: demand.hasDemand ? money(demand.cents) : null,
    biggestMover: mover
      ? {
          meterName: mover.meterName,
          latest: money(mover.latestCents),
          prior: money(mover.priorCents),
          delta: signedMoney(mover.deltaCents),
        }
      : null,
  };
}

export type MeterSummary = {
  id: string;
  name: string;
  rateSchedule: string | null;
  isLegacyRate: boolean;
  account: string | null;
  entity: string | null;
  ranch: string | null;
  isSolar: boolean;
  status: string | null;
  latestBill: MoneyView | null;
};

export type MeterFilters = {
  rate?: string;
  entity?: string;
  ranch?: string;
  limit?: number;
};

function latestPrintedCents(m: MeterView): number | null {
  for (let i = m.periods.length - 1; i >= 0; i--) {
    const cents = m.periods[i]?.printedTotalCents;
    if (typeof cents === "number") return cents;
  }
  return null;
}

function toMeterSummary(m: MeterView): MeterSummary {
  const latest = latestPrintedCents(m);
  return {
    id: m.id,
    name: m.name,
    rateSchedule: m.rateSchedule,
    isLegacyRate: m.isLegacy,
    account: m.accountNumber,
    entity: m.entityName,
    ranch: m.ranchName,
    isSolar: m.isSolar,
    status: m.status,
    latestBill: latest === null ? null : money(latest),
  };
}

/** Case-insensitive contains, treating an empty/absent filter as "match all". */
function matches(value: string | null, filter: string | undefined): boolean {
  if (!filter) return true;
  if (value === null) return false;
  return value.toLowerCase().includes(filter.toLowerCase());
}

export function summarizeMeters(meters: MeterView[], filters: MeterFilters = {}): {
  total: number;
  shown: number;
  meters: MeterSummary[];
} {
  const filtered = meters.filter(
    (m) =>
      matches(m.rateSchedule, filters.rate) &&
      matches(m.entityName, filters.entity) &&
      matches(m.ranchName, filters.ranch),
  );
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 25;
  return {
    total: filtered.length,
    shown: Math.min(filtered.length, limit),
    meters: filtered.slice(0, limit).map(toMeterSummary),
  };
}

/** Find one meter by exact id, exact SA id, or a case-insensitive name contains. */
export function findMeter(meters: MeterView[], query: string): MeterView | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    meters.find((m) => m.id.toLowerCase() === q) ??
    meters.find((m) => (m.serviceId ?? "").toLowerCase() === q) ??
    meters.find((m) => m.name.toLowerCase() === q) ??
    meters.find((m) => m.name.toLowerCase().includes(q)) ??
    null
  );
}

export type MeterQueryResult =
  | { kind: "found"; meter: MeterView }
  | { kind: "ambiguous"; names: string[] }
  | { kind: "none" };

/**
 * Resolve a meter query, distinguishing an ambiguous match from a hit. An exact id / SA id /
 * exact-name match always wins (returns that one meter). Otherwise a case-insensitive name
 * CONTAINS may match several meters (likely at Batth scale, where names repeat across ranches):
 * one match is a hit, multiple is `ambiguous` (so Almond asks the grower to be specific instead
 * of confidently reporting the wrong meter), none is `none`.
 */
export function resolveMeterQuery(meters: MeterView[], query: string): MeterQueryResult {
  const q = query.trim().toLowerCase();
  if (!q) return { kind: "none" };
  const exact =
    meters.find((m) => m.id.toLowerCase() === q) ??
    meters.find((m) => (m.serviceId ?? "").toLowerCase() === q) ??
    meters.find((m) => m.name.toLowerCase() === q);
  if (exact) return { kind: "found", meter: exact };
  const contains = meters.filter((m) => m.name.toLowerCase().includes(q));
  if (contains.length === 1 && contains[0]) return { kind: "found", meter: contains[0] };
  if (contains.length > 1) return { kind: "ambiguous", names: contains.map((m) => m.name) };
  return { kind: "none" };
}

export type MeterDetail = {
  id: string;
  name: string;
  serviceId: string | null;
  rateSchedule: string | null;
  isLegacyRate: boolean;
  serialCode: string | null;
  account: string | null;
  entity: string | null;
  ranch: string | null;
  crop: string | null;
  isSolar: boolean;
  nemType: string | null;
  gpm: number | null;
  status: string | null;
  recentBills: {
    start: string;
    close: string;
    total: MoneyView | null;
    demandCharge: MoneyView | null;
    peakKw: number | null;
    tariff: string | null;
  }[];
};

export function summarizeMeterDetail(m: MeterView): MeterDetail {
  const recent = m.periods.slice(-6).map((p) => ({
    start: p.start,
    close: p.close,
    total: p.printedTotalCents === null ? null : money(p.printedTotalCents),
    demandCharge: p.demandCents === null ? null : money(p.demandCents),
    peakKw: p.peakKw,
    tariff: p.tariff,
  }));
  return {
    id: m.id,
    name: m.name,
    serviceId: m.serviceId,
    rateSchedule: m.rateSchedule,
    isLegacyRate: m.isLegacy,
    serialCode: m.serialCode,
    account: m.accountNumber,
    entity: m.entityName,
    ranch: m.ranchName,
    crop: m.cropName,
    isSolar: m.isSolar,
    nemType: m.nemType,
    gpm: m.gpm,
    status: m.status,
    recentBills: recent,
  };
}

export type RateSummaryRow = { rate: string; meterCount: number; isLegacy: boolean };

/** Distinct rate schedules across the farm, most common first. Meters with no rate on file
 *  are grouped under "(unknown)". */
export function rateSchedulesByFrequency(meters: MeterView[]): RateSummaryRow[] {
  const byRate = new Map<string, { count: number; isLegacy: boolean }>();
  for (const m of meters) {
    const rate = m.rateSchedule ?? UNKNOWN_RATE;
    const prev = byRate.get(rate);
    if (prev) prev.count += 1;
    else byRate.set(rate, { count: 1, isLegacy: m.isLegacy });
  }
  return [...byRate.entries()]
    .map(([rate, v]) => ({ rate, meterCount: v.count, isLegacy: v.isLegacy }))
    .sort((a, b) => b.meterCount - a.meterCount || a.rate.localeCompare(b.rate));
}

export type ReconciliationSummary = {
  meterCount: number;
  byCoverageState: { state: string; meterCount: number }[];
};

export function summarizeReconciliation(meters: MeterView[]): ReconciliationSummary {
  const byState = new Map<string, number>();
  for (const m of meters) {
    const state = String(m.coverageState);
    byState.set(state, (byState.get(state) ?? 0) + 1);
  }
  return {
    meterCount: meters.length,
    byCoverageState: [...byState.entries()]
      .map(([state, meterCount]) => ({ state, meterCount }))
      .sort((a, b) => b.meterCount - a.meterCount || a.state.localeCompare(b.state)),
  };
}

export type FindingSummary = {
  situation: string;
  action: string | null;
  impact: MoneyView | null;
  impactNote: string | null;
  severity: FindingView["severity"];
  meterName: string | null;
};

/** The farm's pending findings, highest-impact first, as the model should quote them. A
 *  sub-dollar impact is treated as no dollar figure (never headline an opportunity "worth $0";
 *  savings are not cent-exact anyway), leaving the impactNote to carry the story. */
export function summarizeFindings(findings: FindingView[]): FindingSummary[] {
  return findings.map((f) => {
    const hasDollar = f.impactUsd !== null && Math.abs(f.impactUsd) >= 1;
    return {
      situation: f.situation,
      action: f.actionLabel,
      impact: hasDollar ? money(Math.round(f.impactUsd as number * 100)) : null,
      impactNote: f.impactNote,
      severity: f.severity,
      meterName: f.meterName,
    };
  });
}
