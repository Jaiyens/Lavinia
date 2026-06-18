// The single read path for Almond's exports (Epic 8). A spreadsheet must contain EVERY meter
// on the farm, never a sample: the chat tools (src/lib/almond/tools.ts -> listMeters) cap their
// rows for the model's context window (max 50, default 25), but an export is a deterministic,
// FULL-data document. This loader reads the same shipped, farm-scoped dashboard loader
// (loadMetersForFarm) WITHOUT any cap, so it returns the whole inventory.
//
// It is scoped strictly to the resolved farmId carried on `deps` (the Story 7.2 AlmondToolDeps
// shape, resolved server-side in the route from the session). It accepts NO scope argument from a
// caller: a grower can never export another farm's meters because the farmId never crosses the
// tool boundary. Pure read path, no writes.
//
// Alongside the rows it returns the COVERAGE / AS-OF state (consumed by the 8.4 export footer):
// how many meters are reconciled vs need a look vs have no bill, and the most recent billing-cycle
// close across the farm. Absence is EXPLICIT: a farm with no posted bill reports `asOf: null`, never
// a fabricated or zero date. The footer reads these to label what the spreadsheet does and does not
// yet cover, so a missing value is shown as a coverage label, never invented.

import type { PrismaClient } from "@prisma/client";
import { loadMetersForFarm, type MeterView } from "@/lib/dashboard/load";
import type { CoverageState } from "@/lib/recommendations/types";

/**
 * The deps the export loader closes over. The SAME shape the Story 7.2 tool factory uses
 * (AlmondToolDeps): a Prisma client plus a single server-resolved farmId (and the farm's name,
 * carried for the export header/filename). Scope lives here, never in a function argument.
 */
export type ExportLoadDeps = {
  prisma: PrismaClient;
  farmId: string;
  farmName: string;
};

/** Per-coverage-state meter counts. A genuine zero is reported as 0, never omitted. */
export type ExportCoverage = {
  /** Total meters in the export (the full inventory; the coverage denominator). */
  total: number;
  reconciled: number;
  needsReview: number;
  noBill: number;
};

/**
 * The coverage / as-of state that travels WITH the rows (consumed by the 8.4 footer).
 * `asOf` is the most recent POSTED billing-cycle close across the whole farm as an ISO 8601 string
 * (only periods carrying a printed total count - a metered/scheduled close on a live-connected meter
 * with no scanned bill is never surfaced), or null when no meter has a posted bill yet - absence is
 * explicit, never a faked date.
 */
export type ExportCoverageState = {
  coverage: ExportCoverage;
  asOf: string | null;
};

/**
 * The full export payload: every meter on the farm (uncapped) plus the coverage / as-of state.
 * `meters` is the canonical MeterView[] (the same projection the dashboard table reads), so the
 * 8.2 column selection and 8.3 value authoring operate on exactly the shapes already shipped.
 */
export type ExportData = {
  farm: { id: string; name: string };
  meters: MeterView[];
  state: ExportCoverageState;
};

const RECONCILED: CoverageState = "reconciled";
const NEEDS_REVIEW: CoverageState = "needs_review";
const NO_BILL: CoverageState = "no_bill";

/** Tally meters by coverage state. Every state is counted, so a genuine zero shows as 0. */
function summarizeCoverage(meters: readonly MeterView[]): ExportCoverage {
  let reconciled = 0;
  let needsReview = 0;
  let noBill = 0;
  for (const m of meters) {
    if (m.coverageState === RECONCILED) reconciled += 1;
    else if (m.coverageState === NEEDS_REVIEW) needsReview += 1;
    else if (m.coverageState === NO_BILL) noBill += 1;
  }
  return { total: meters.length, reconciled, needsReview, noBill };
}

/**
 * The most recent POSTED billing-cycle close across every meter, as an ISO 8601 string, or null
 * when no meter carries a posted bill. A period only counts when it is a posted bill - it carries a
 * `printedTotalCents` (the shipped "posted" signal, mirroring coverageState === 'reconciled' as
 * src/lib/dashboard/csv.ts gates its money cells, and result.ts treats a printed total as posted).
 * A live-connected meter (Green Button / UtilityAPI / Bayou) with no scanned bill has periods whose
 * `close` is set but `printedTotalCents` is null (src/lib/greenbutton/import.ts never sets it on the
 * upsert); those are SCHEDULED/metered ends, NOT billed, so they are skipped - surfacing one as the
 * as-of would be the "metered date shown as billed" the honesty law forbids. Periods are
 * start-ascending in MeterView, but we compare close dates across all posted periods so the as-of
 * reflects the freshest cycle the farm actually has BILLED. Null is the honest "no bill posted yet"
 * - the footer labels it, never invents a date.
 */
function latestPostedClose(meters: readonly MeterView[]): string | null {
  let latest: string | null = null;
  for (const m of meters) {
    for (const p of m.periods) {
      if (p.printedTotalCents === null) continue; // not a posted bill: never surface as billed
      if (latest === null || p.close > latest) latest = p.close;
    }
  }
  return latest;
}

/**
 * Derive the coverage / as-of state for a set of meters. The single place a meter set becomes the
 * footer's honesty state, so the loader and any caller that narrows the inventory (e.g. the
 * exportSpreadsheet skill applying a filter) report coverage the SAME way - the footer always
 * describes exactly the rows in the file, never the unfiltered farm. Pure (no Prisma, no clock).
 */
export function summarizeExportState(meters: readonly MeterView[]): ExportCoverageState {
  return {
    coverage: summarizeCoverage(meters),
    asOf: latestPostedClose(meters),
  };
}

/**
 * Load the FULL, farm-scoped export data: every meter on the resolved farm (no chat-tool row cap)
 * plus the coverage / as-of state for the footer. The single read path for exports.
 *
 * Scope is taken ONLY from `deps.farmId` (server-resolved); there is deliberately no scope
 * parameter, so a caller can never widen or redirect the read to another farm. Read-only: it calls
 * the shipped `loadMetersForFarm` and derives counts/dates purely - it never writes.
 */
export async function loadExportData(deps: ExportLoadDeps): Promise<ExportData> {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return {
    farm: { id: deps.farmId, name: deps.farmName },
    meters,
    state: summarizeExportState(meters),
  };
}
