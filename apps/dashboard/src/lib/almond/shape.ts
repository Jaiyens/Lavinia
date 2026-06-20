import type { MeterView } from "@/lib/dashboard/load";
import type { KpiStrip } from "@/lib/dashboard/kpi";
import type { FindingView } from "@/lib/dashboard/findings";
import { formatUsdWhole } from "@/lib/format/money";
import { en } from "@/copy/en";

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

// ---------------------------------------------------------------------------
// H-1 (FR29): the solar legibility Almond can read about one meter.
// ---------------------------------------------------------------------------

/**
 * The solar facts Almond states for a meter, carried verbatim from what the Solar tab renders so
 * every figure the model quotes is one the grower can see (FR29). STRUCTURE and TIMING only - never a
 * net-metering credit dollar (the credit stays honest-blank; H-2 makes Almond point to the upload
 * path). Each field is a PLAIN-ENGLISH phrase, not a raw token, so the model reads it without
 * paraphrasing a number; the structured `arrayCount` / `sharePct` ride alongside for precision.
 *
 * The data-gated dimensions are surfaced HONESTLY, never fabricated: the granular program code (A-4)
 * is gated to the generic NEM2 token at launch, the grandfather position (FR16) needs an
 * interconnection date that is not on file, and the demand-charge reality (E-1/E-2) renders only when
 * the fail-closed demand insight is on file. Where the input is absent the phrase says "not on file",
 * matching the honest-blank contract, so Almond never states a vintage, expiry, or credit it cannot
 * trace.
 */
export type MeterSolarView = {
  /** The net-metering program meaning, in plain words ("on NEM2 net metering"). Never a guessed code. */
  program: string;
  /** Array membership said in plain words; the count rides alongside for precision. */
  arrayMembership: string;
  /** How many arrays credit this meter. */
  arrayCount: number;
  /** This meter's usage-proportional share across its arrays, in plain words; null when no usage. */
  share: string;
  /** The single largest usage-proportional share as a whole percent, when on file; else null. */
  sharePct: number | null;
  /** The grandfather position, in plain words; honest "not on file" until the interconnection date lands. */
  grandfather: string;
  /** The demand-charge reality, in plain words; honest "not on file" when the demand insight fails closed. */
  demandReality: string;
};

/**
 * The pre-derived solar inputs the shape needs that do not live on a single MeterView: the
 * per-meter usage-proportional shares (computed across the whole farm by `buildSolarDataset`) and the
 * demand-charge reality (computed in the tools edge from the fail-closed `nemDemandInsight` + the bill
 * floor, which need the rate card). The shape stays PURE (NFR1) by taking these as plain arguments;
 * the tools layer assembles them farm-scoped. Both optional: a meter with neither gets the honest
 * not-on-file phrasing, never a fabricated value.
 */
export type MeterSolarContext = {
  /** The meter's largest usage-proportional array share, in [0,1]; null/absent = no usage on file. */
  sharePct?: number | null;
  /** The billed demand charge solar does not cover, integer cents; absent = no demand insight on file. */
  demandOwedCents?: number | null;
  /** The portion of the bill solar does not cover, in [0,1]; absent = not quotable beside the dollar. */
  uncoveredShare?: number | null;
};

/**
 * Shape one solar meter's legibility for Almond (H-1). Pure: derives every phrase from the meter's own
 * fields plus the pre-derived `MeterSolarContext`. Honest-blank by construction: the program reads the
 * generic NEM2 meaning for the generic token (never a guessed granular code), the grandfather position
 * reads "not on file" (the interconnection date is data-gated, DM1), and the demand reality renders
 * only when the demand charge is on file. No net-metering credit dollar is ever stated here.
 */
export function summarizeMeterSolar(m: MeterView, ctx: MeterSolarContext = {}): MeterSolarView {
  const c = en.solar.almond;

  // Program meaning. A-4's granular six-code resolution is data-gated to the generic NEM2 token at
  // launch, so a present token reads as the generic program; an absent token reads not-on-file. Never
  // a guessed NEM2-family code.
  const token = m.nemType?.trim() ?? "";
  const program =
    token.length === 0
      ? c.programNotOnFile
      : token.toLowerCase() === "nem2"
        ? c.programGeneric
        : c.programGranular(token);

  // Array membership, in plain words.
  const arrayCount = m.benefitingArrays.length;
  const arrayMembership = arrayCount === 0 ? c.arrayNone : c.arrayMembership(arrayCount);

  // Usage-proportional share. The structured percent comes from the tools edge (computed across the
  // whole farm by buildSolarDataset); absent => no usage on file (never a fabricated zero).
  const sharePct =
    ctx.sharePct === null || ctx.sharePct === undefined ? null : Math.round(ctx.sharePct * 100);
  const share = sharePct === null ? c.shareNotOnFile : c.sharePercent(sharePct);

  // Grandfather position (FR16): data-gated on the interconnection date (DM1), not on file at launch,
  // so always honest not-on-file. Never an estimated vintage or expiry.
  const grandfather = c.grandfatherNotOnFile;

  // Demand-charge reality (E-1/E-2): renders only when the fail-closed demand insight is on file (a
  // billed demand charge, never a net-metering credit). Honest not-on-file otherwise.
  const demandReality =
    ctx.demandOwedCents === null || ctx.demandOwedCents === undefined
      ? c.demandNotOnFile
      : ctx.uncoveredShare === null || ctx.uncoveredShare === undefined
        ? c.demandReality(formatUsdWhole(ctx.demandOwedCents))
        : c.demandRealityWithShare(
            formatUsdWhole(ctx.demandOwedCents),
            Math.round(ctx.uncoveredShare * 100),
          );

  return { program, arrayMembership, arrayCount, share, sharePct, grandfather, demandReality };
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
  /** H-1 (FR29): the solar legibility, present only for a solar meter; null for a non-solar meter. */
  solar: MeterSolarView | null;
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

/**
 * Per-meter solar context keyed by pump id, assembled farm-scoped in the tools edge (H-1). A meter
 * absent from the map (or a non-solar meter) gets no solar shape; the map only carries solar meters.
 */
export type SolarContextByMeter = Map<string, MeterSolarContext>;

function toMeterSummary(m: MeterView, solarCtx?: SolarContextByMeter): MeterSummary {
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
    // H-1: a solar meter carries the same solar facts the Solar tab shows; non-solar meters carry none.
    solar: m.isSolar ? summarizeMeterSolar(m, solarCtx?.get(m.id) ?? {}) : null,
  };
}

/** Case-insensitive contains, treating an empty/absent filter as "match all". */
function matches(value: string | null, filter: string | undefined): boolean {
  if (!filter) return true;
  if (value === null) return false;
  return value.toLowerCase().includes(filter.toLowerCase());
}

export function summarizeMeters(
  meters: MeterView[],
  filters: MeterFilters = {},
  solarCtx?: SolarContextByMeter,
): {
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
    meters: filtered.slice(0, limit).map((m) => toMeterSummary(m, solarCtx)),
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
  /** H-1 (FR29): the solar legibility, present only for a solar meter; null for a non-solar meter. */
  solar: MeterSolarView | null;
};

export function summarizeMeterDetail(m: MeterView, solarCtx?: MeterSolarContext): MeterDetail {
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
    // H-1: a solar meter carries the same solar facts the Solar tab shows; non-solar meters carry none.
    solar: m.isSolar ? summarizeMeterSolar(m, solarCtx ?? {}) : null,
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
