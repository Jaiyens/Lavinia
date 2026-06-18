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
 * `asOf` is the most recent billing-cycle close across the whole farm as an ISO 8601 string,
 * or null when no meter has a posted bill yet - absence is explicit, never a faked date.
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
 * The most recent billing-cycle close across every meter, as an ISO 8601 string, or null when
 * no meter carries a posted bill. Periods are start-ascending in MeterView, but we compare close
 * dates across all meters so the as-of reflects the freshest cycle the farm has on file. Null is
 * the honest "no bill posted yet" - the footer labels it, never invents a date.
 */
function latestCycleClose(meters: readonly MeterView[]): string | null {
  let latest: string | null = null;
  for (const m of meters) {
    for (const p of m.periods) {
      if (latest === null || p.close > latest) latest = p.close;
    }
  }
  return latest;
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
    state: {
      coverage: summarizeCoverage(meters),
      asOf: latestCycleClose(meters),
    },
  };
}
