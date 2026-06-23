// The Almond landing command-center stats: four honest figures rolled up from the farm's OWN
// reconciled data (never fabricated, AR-15) for the Palantir-style KPI row on the /almond page.
// Pure + tested; the page resolves meters + findings server-side and hands them here.
//
// Each figure leans on an existing, already-tested rollup so there is one source of truth:
//   - savingsUsd        = findingsAtRiskUsd (sum of open findings' positive dollar impacts)
//   - metersAtRisk      = meters flagged BAD or still needing review (the coverage-gap signal)
//   - lastMonthSpendCents = computeKpiStrip(meters).spend.cents (reconciled printed totals; the
//                           page renders "Not on file" when it is null/0)
//   - activeAlerts      = open findings at the "act" severity (the ones needing a decision)

import type { MeterView } from "@/lib/dashboard/load";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { findingsAtRiskUsd, type FindingView } from "@/lib/dashboard/findings";

/** A meter is "at risk" when its master-sheet pump health reads BAD, or its bill coverage still
 *  needs review (an unreconciled bill the grower has not cleared). Both are surfaced on the same
 *  card as the count the grower should look at next. */
const BAD_STATUS = "BAD";
const NEEDS_REVIEW = "needs_review";

/** The "act" severity: a finding that wants a decision now (vs the quieter info/watch tiers). */
const ACT_SEVERITY = "act";

export type LandingStats = {
  /** Sum of open findings' positive dollar impacts, in FLOAT dollars (matches findingsAtRiskUsd). */
  savingsUsd: number;
  /** Count of meters flagged BAD or still needing bill review. */
  metersAtRisk: number;
  /** Latest reconciled PG&E spend in integer cents; null when none is on file (render "Not on file"). */
  lastMonthSpendCents: number | null;
  /** Count of open findings at the "act" severity (need a decision). */
  activeAlerts: number;
};

/**
 * Roll the farm's meters + findings into the four landing stats. Pure: no DB, no I/O. The page is
 * the one that owner-scopes and loads the real data; this only computes. A spend of 0 cents is
 * normalized to null so an honest "Not on file" renders instead of a fabricated "$0".
 */
export function computeLandingStats({
  meters,
  findings,
}: {
  meters: readonly MeterView[];
  findings: readonly FindingView[];
}): LandingStats {
  const savingsUsd = findingsAtRiskUsd(findings);

  const metersAtRisk = meters.reduce(
    (count, m) => (m.status === BAD_STATUS || m.coverageState === NEEDS_REVIEW ? count + 1 : count),
    0,
  );

  const spendCents = computeKpiStrip([...meters]).spend.cents;
  const lastMonthSpendCents = spendCents > 0 ? spendCents : null;

  const activeAlerts = findings.reduce(
    (count, f) => (f.severity === ACT_SEVERITY ? count + 1 : count),
    0,
  );

  return { savingsUsd, metersAtRisk, lastMonthSpendCents, activeAlerts };
}
