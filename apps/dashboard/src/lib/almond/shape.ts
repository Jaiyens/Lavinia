import type { MeterView } from "@/lib/dashboard/load";
import type { KpiStrip } from "@/lib/dashboard/kpi";
import type { FindingView } from "@/lib/dashboard/findings";
import type { EnrichedMeter, FarmAnalysis } from "./analysis";
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

// --- Ranking / aggregation (the queryMeters tool, Almond hardening T2) ---------------------------
//
// The pure ranker the `queryMeters` tool (tools.ts) is built on, so the agent answers "which costs
// the most / top N / by entity / priciest pump" with a real ranking instead of punting. It reads
// the SINGLE source of truth, the T1 `FarmAnalysis` (cost = latest-reconciled printed total, savings
// = the meter's top rate-switch finding), so a number Almond ranks on can never disagree with the
// dashboard. Pure (no Prisma, no I/O), so it is unit-testable offline over a fixture analysis.

/** What to rank by: `cost` (latest reconciled bill), `demand` (latest demand charge), or `savings`
 *  (estimated annual rate-switch saving). All three sort on the same integer-cents fields the
 *  analysis already carries; null cents sort LAST in a descending rank (unknown is never "the most").
 */
export type RankSortBy = "cost" | "demand" | "savings";
export type RankOrder = "asc" | "desc";

export type RankMetersOptions = {
  /** The field to rank on (default "cost"). */
  sortBy?: RankSortBy;
  /** Sort direction (default "desc": the priciest / biggest-saving first). */
  order?: RankOrder;
  /** Keep only mis-rated (rate-switch opportunity) meters before ranking, when "savings". The
   *  savings sort already drops zero-saving meters; an explicit savings request implies them. */
  filterRate?: string;
  /** Case-insensitive contains filter on the legal billing entity. */
  filterEntity?: string;
  /** Cap the returned rows (after sorting). Omit for all. */
  limit?: number;
};

/** The integer-cents value a meter is ranked on for a given field; null when that meter has no
 *  proven value for it (sorted last in a descending rank, never treated as the largest). A zero
 *  saving is a real 0 (not "unknown"), so a savings rank can legitimately end in zeros. */
function rankValue(m: EnrichedMeter, sortBy: RankSortBy): number | null {
  if (sortBy === "demand") return m.demandChargeCents;
  if (sortBy === "savings") return m.flags.estAnnualSavingsCents;
  return m.thisCycleCents;
}

/** Stable comparator over a cents getter that puts null LAST regardless of order (null is "unknown",
 *  never the most or least), then orders the known values asc/desc, with the analysis's name/id
 *  tie-break for a deterministic result. */
function compareByValue(
  getCents: (m: EnrichedMeter) => number | null,
  order: RankOrder,
): (a: EnrichedMeter, b: EnrichedMeter) => number {
  return (a, b) => {
    const ca = getCents(a);
    const cb = getCents(b);
    if (ca === null && cb === null) return rankTieBreak(a, b);
    if (ca === null) return 1;
    if (cb === null) return -1;
    if (ca !== cb) return order === "asc" ? ca - cb : cb - ca;
    return rankTieBreak(a, b);
  };
}

function rankTieBreak(a: EnrichedMeter, b: EnrichedMeter): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Case-insensitive contains, treating an empty/absent filter as "match all" (mirrors `matches`). */
function rankMatches(value: string | null, filter: string | undefined): boolean {
  if (!filter) return true;
  if (value === null) return false;
  return value.toLowerCase().includes(filter.toLowerCase());
}

/**
 * Rank the farm's meters by a chosen field, the pure core of the `queryMeters` tool. Reuses the T1
 * analysis: a "savings" rank is `analysis.opportunities` (mis-rated meters, biggest saving first)
 * narrowed by any filter; a "cost"/"demand" rank sorts the enriched meters on the matching cents
 * field. Filters are case-insensitive contains on rate and entity. The result is deterministic
 * (null cents last; name/id tie-break), so the same query always returns the same order.
 */
export function rankMeters(analysis: FarmAnalysis, opts: RankMetersOptions = {}): EnrichedMeter[] {
  const sortBy = opts.sortBy ?? "cost";
  const order = opts.order ?? "desc";
  // A savings rank starts from the mis-rated opportunities (already a rate switch with a positive
  // saving); cost/demand start from every meter. Then apply the optional filters.
  const base = sortBy === "savings" ? analysis.opportunities : analysis.meters;
  const filtered = base.filter(
    (m) => rankMatches(m.rate, opts.filterRate) && rankMatches(m.entity, opts.filterEntity),
  );
  const sorted = [...filtered].sort(compareByValue((m) => rankValue(m, sortBy), order));
  if (opts.limit !== undefined && opts.limit > 0) return sorted.slice(0, opts.limit);
  return sorted;
}

/** A per-entity rollup of a ranking (groupBy: "entity"), summing the ranked field across the meters
 *  in each entity. Built from the SAME `analysis.byEntity` rollups for cost/demand (so the totals
 *  agree with the dashboard's per-entity figures) and from the ranked meters for savings. Sorted
 *  desc by the summed value (asc when requested), with an entity-name tie-break. */
export type EntityRankRow = {
  entity: string;
  meterCount: number;
  /** The summed ranked field in integer cents (cost, demand, or savings). */
  totalCents: number;
};

export function rankByEntity(analysis: FarmAnalysis, opts: RankMetersOptions = {}): EntityRankRow[] {
  const sortBy = opts.sortBy ?? "cost";
  const order = opts.order ?? "desc";
  const rows = new Map<string, EntityRankRow>();
  for (const m of rankMeters(analysis, { ...opts, limit: undefined })) {
    if (m.entity === null) continue;
    const row = rows.get(m.entity) ?? { entity: m.entity, meterCount: 0, totalCents: 0 };
    row.meterCount += 1;
    row.totalCents += rankValue(m, sortBy) ?? 0;
    rows.set(m.entity, row);
  }
  const sorted = [...rows.values()].sort((a, b) => {
    if (a.totalCents !== b.totalCents) {
      return order === "asc" ? a.totalCents - b.totalCents : b.totalCents - a.totalCents;
    }
    return a.entity < b.entity ? -1 : a.entity > b.entity ? 1 : 0;
  });
  if (opts.limit !== undefined && opts.limit > 0) return sorted.slice(0, opts.limit);
  return sorted;
}

/** One ranked meter, shaped for the model: the name, where it sits, its rate, and the three integer-
 *  cents economics the rank can be read from (the model quotes whichever the question asked). Numbers
 *  stay numbers; no formatted string here (the model formats whole dollars at the surface). */
export type RankedMeterRow = {
  name: string;
  entity: string | null;
  ranch: string | null;
  rate: string | null;
  /** Latest reconciled printed total in cents; null when the meter has no posted bill. */
  thisCycleCents: number | null;
  /** Latest reconciled demand charge in cents; null when none. */
  demandChargeCents: number | null;
  /** Estimated annual rate-switch saving in cents (0 when the meter is not mis-rated). */
  estSavingsCents: number;
  /** The suggested rate when this meter is mis-rated; null otherwise. */
  suggestedRate: string | null;
};

function toRankedMeterRow(m: EnrichedMeter): RankedMeterRow {
  return {
    name: m.name,
    entity: m.entity,
    ranch: m.ranch,
    rate: m.rate,
    thisCycleCents: m.thisCycleCents,
    demandChargeCents: m.demandChargeCents,
    estSavingsCents: m.flags.estAnnualSavingsCents,
    suggestedRate: m.flags.suggestedRate,
  };
}

/** The compact, model-readable shape the `queryMeters` tool returns: the ranked list (or per-entity
 *  rollups when grouped), how it was sorted, and a tiny aggregate (count + summed ranked field) so
 *  the model can state a total without re-summing. Numbers stay numbers (integer cents). */
export type RankedMetersView = {
  sortBy: RankSortBy;
  order: RankOrder;
  count: number;
  /** The summed ranked field across the RETURNED rows, integer cents. */
  totalCents: number;
  meters: RankedMeterRow[];
  /** Per-entity rollups, present only when groupBy "entity" was requested. */
  byEntity?: EntityRankRow[];
};

/**
 * Shape a ranking for the model: the ranked meter rows plus a small aggregate (count and the summed
 * ranked field). When `groupBy` is "entity" it also carries per-entity rollups. The summed total is
 * over the RETURNED rows (so a top-5 total is the top 5, not the whole farm), with null cents counted
 * as 0. This is what `queryMeters.execute` returns; pure so it is unit-testable without a model.
 */
export function summarizeRanking(
  analysis: FarmAnalysis,
  opts: RankMetersOptions & { groupBy?: "entity" } = {},
): RankedMetersView {
  const sortBy = opts.sortBy ?? "cost";
  const order = opts.order ?? "desc";
  const ranked = rankMeters(analysis, opts);
  const rows = ranked.map(toRankedMeterRow);
  const totalCents = ranked.reduce((sum, m) => sum + (rankValue(m, sortBy) ?? 0), 0);
  const view: RankedMetersView = {
    sortBy,
    order,
    count: rows.length,
    totalCents,
    meters: rows,
  };
  if (opts.groupBy === "entity") view.byEntity = rankByEntity(analysis, opts);
  return view;
}
