// Pure derivations for the meter table (Story 2.4, the P0 lens). Projects the canonical
// MeterView[] into display rows, filters by the active entity/ranch/rate, and sorts by any
// column - all without UI or DB so the table component only renders and 2.6 can reuse the
// filter for the KPI recompute. AR-15 lives here: cost/demand are carried ONLY for reconciled
// meters; an unreconciled meter's figure is null (the cell renders the coverage treatment,
// never a fabricated $0).

import type { MeterView, CostSource } from "./load";
import type { CoverageState } from "@/lib/recommendations/types";

export type SortKey =
  | "name"
  | "ranch"
  | "entity"
  | "rate"
  | "peak"
  | "cost"
  | "demand"
  | "status"
  | "coverage";

export type SortDir = "asc" | "desc";

/** The active filter (the nuqs entity/ranch/rate/account/program keys). An absent/empty key is a
 *  no-op. `account` matches `MeterView.accountNumber` (the PG&E account number, FR1); `program`
 *  matches `MeterView.nemType` (the net-metering program token straight off the meter - the same
 *  field A-4's resolveProgramCode labels, never an inferred code). Both are A-7 (FR1/UX5). */
export type MeterFilter = {
  entity?: string | null;
  ranch?: string | null;
  rate?: string | null;
  account?: string | null;
  program?: string | null;
};

export type MeterRow = {
  /** The source meter, carried for the row click -> drawer (`meter` nuqs key, Story 2.5). */
  meter: MeterView;
  name: string;
  ranch: string | null;
  entity: string | null;
  rate: string | null;
  isLegacy: boolean;
  /** Latest cycle's peak demand kW (the billed 15-min peak); null when no period carries one. */
  peakKw: number | null;
  /** Master-sheet pump health, verbatim; null when unknown. */
  status: string | null;
  coverageState: CoverageState;
  /** This-cycle cost (latest period) in integer cents; null unless reconciled. */
  costCents: number | null;
  /** Cost provenance (BILLED renders as actual; MODELED renders as an estimate; REVIEW/NONE
   *  render the coverage treatment). Carried so the cell can show a modeled estimate without
   *  ever presenting it as a billed figure. */
  costSource: CostSource;
  /** Modeled monthly cost estimate in integer cents; rendered ONLY when costSource is MODELED. */
  modeledCents: number | null;
  /** Latest demand charge in integer cents; null unless reconciled. A reconciled meter that
      carries NO demand charge is also null here - the cell distinguishes the two by reading
      coverageState (reconciled + null = "None"; unreconciled = the coverage treatment). */
  demandCents: number | null;
  /** Flagged pump health (status === "BAD"): the one inventory concern signal we have today. */
  isFlagged: boolean;
};

const RECONCILED: CoverageState = "reconciled";

/** Most-recent period (periods are start-ascending in MeterView). */
function latestPeriod(m: MeterView) {
  return m.periods[m.periods.length - 1];
}

/** The meter's peak demand kW: the latest period's billed peak, else the highest across periods. */
function meterPeakKw(m: MeterView): number | null {
  const latest = latestPeriod(m);
  if (latest?.peakKw != null) return latest.peakKw;
  let max: number | null = null;
  for (const p of m.periods) {
    if (p.peakKw != null) max = max === null ? p.peakKw : Math.max(max, p.peakKw);
  }
  return max;
}

/** Project a meter to its table row. Cost/demand are gated on coverage (AR-15). */
export function toMeterRow(m: MeterView): MeterRow {
  const reconciled = m.coverageState === RECONCILED;
  const latest = latestPeriod(m);
  return {
    meter: m,
    name: m.name,
    ranch: m.ranchName,
    entity: m.entityName,
    rate: m.rateSchedule,
    isLegacy: m.isLegacy,
    peakKw: meterPeakKw(m),
    status: m.status,
    coverageState: m.coverageState,
    costCents: reconciled ? (latest?.printedTotalCents ?? null) : null,
    costSource: m.costSource ?? "NONE",
    modeledCents: m.costSource === "MODELED" ? (m.modeledMonthlyCents ?? null) : null,
    demandCents: reconciled ? (latest?.demandCents ?? null) : null,
    isFlagged: m.status === "BAD",
  };
}

/** Narrow meters to those matching every set filter key (exact match on the canonical field,
    compared whitespace-trimmed on BOTH sides so an option offered by filterOptions always
    matches the meter that produced it - extraction-path values can carry padding).
    A null/empty/whitespace key is a no-op, so an unset filter returns the whole farm. */
export function filterMeters(meters: readonly MeterView[], filter: MeterFilter): MeterView[] {
  const entity = filter.entity?.trim() || null;
  const ranch = filter.ranch?.trim() || null;
  const rate = filter.rate?.trim() || null;
  const account = filter.account?.trim() || null;
  const program = filter.program?.trim() || null;
  const eq = (field: string | null, want: string) => field !== null && field.trim() === want;
  return meters.filter(
    (m) =>
      (entity === null || eq(m.entityName, entity)) &&
      (ranch === null || eq(m.ranchName, ranch)) &&
      (rate === null || eq(m.rateSchedule, rate)) &&
      (account === null || eq(m.accountNumber, account)) &&
      (program === null || eq(m.nemType, program)),
  );
}

// Coverage sorts by attention order: trusted figures first, then the rows that need a look.
const COVERAGE_ORDER: Record<CoverageState, number> = {
  reconciled: 0,
  needs_review: 1,
  no_bill: 2,
};

/** Locale-aware, numeric-aware string compare (so "AG5" < "AG12" reads naturally). */
function strCmp(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

function applyDir(base: number, dir: SortDir): number {
  return dir === "asc" ? base : -base;
}

/** Compare nullable values, pushing nulls to the END regardless of direction, so a real value
    is never hidden under a blank cell. Non-null pairs apply the sort direction. */
function cmpNullsLast<T>(
  a: T | null,
  b: T | null,
  cmp: (x: T, y: T) => number,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return applyDir(cmp(a, b), dir);
}

function primaryCompare(a: MeterRow, b: MeterRow, key: SortKey, dir: SortDir): number {
  switch (key) {
    case "name":
      return applyDir(strCmp(a.name, b.name), dir);
    case "ranch":
      return cmpNullsLast(a.ranch, b.ranch, strCmp, dir);
    case "entity":
      return cmpNullsLast(a.entity, b.entity, strCmp, dir);
    case "rate":
      return cmpNullsLast(a.rate, b.rate, strCmp, dir);
    case "status":
      return cmpNullsLast(a.status, b.status, strCmp, dir);
    case "cost":
      return cmpNullsLast(a.costCents, b.costCents, (x, y) => x - y, dir);
    case "demand":
      return cmpNullsLast(a.demandCents, b.demandCents, (x, y) => x - y, dir);
    case "peak":
      return cmpNullsLast(a.peakKw, b.peakKw, (x, y) => x - y, dir);
    case "coverage":
      return applyDir(COVERAGE_ORDER[a.coverageState] - COVERAGE_ORDER[b.coverageState], dir);
  }
}

/** Sort rows by a column, deterministically. Nulls sort last (see cmpNullsLast); ties break by
    name ascending so the order is stable across calls and test runs. Pure (returns a new array). */
export function sortRows(rows: readonly MeterRow[], key: SortKey, dir: SortDir): MeterRow[] {
  return [...rows].sort((a, b) => {
    const primary = primaryCompare(a, b, key, dir);
    if (primary !== 0 || key === "name") return primary;
    return strCmp(a.name, b.name);
  });
}
