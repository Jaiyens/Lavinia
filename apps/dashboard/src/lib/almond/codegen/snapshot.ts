/**
 * The canonical farm-data SNAPSHOT handed to the code-gen export pipeline (the POC's single source of
 * truth). Every number in a generated report must trace back to a value HERE; the snapshot is also the
 * allowlist the verifier scans the rendered PDF against (src/lib/almond/codegen/verify.ts).
 *
 * There is no `analyzeFarm()` on this branch — the snapshot is COMPOSED from the same shipped, grounded
 * loaders the dashboard and the deterministic report skill already read:
 *   - meters:   loadMetersForFarm (src/lib/dashboard/load.ts)
 *   - findings: loadFindings (src/lib/dashboard/findings.ts)
 *   - spend:    computeKpiStrip (src/lib/dashboard/kpi.ts)
 *   - coverage: summarizeExportState (src/lib/almond/export/load.ts)
 *
 * Money is INTEGER CENTS end to end (no float drift); a pre-formatted `savingsDisplay` rides alongside
 * so the model renders an exact, dashboard-matching dollar string rather than formatting cents itself.
 *
 * The composition is split into PURE functions (`extractOpportunities`, `composeReportSnapshot`) so the
 * logic — the rate-switch narrowing, the cents conversion, the sort/rank, the totals — is unit-tested
 * offline with synthetic fixtures (snapshot.test.ts), zero DB. `buildReportSnapshot(deps)` is the thin
 * Prisma wiring that feeds the loaders into the pure core.
 */

import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadFindings, type FindingView } from "@/lib/dashboard/findings";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { toMeterRow } from "@/lib/dashboard/table";
import { summarizeExportState } from "@/lib/almond/export/load";
import type { AlmondToolDeps } from "@/lib/almond/tools";

/** One ranked, money-saving opportunity in the snapshot. The ADDRESSABLE array element the manifest's
 *  `sourcePath` points at (e.g. `opportunities[0].savingsCents`), so it is the verification anchor. */
export type SnapshotOpportunity = {
  /** 1-based rank by savings (descending); rank 1 is the biggest opportunity. */
  rank: number;
  meterName: string;
  /** The meter's CURRENT rate schedule (from the MeterView), or null if unknown. */
  fromRate: string | null;
  /** The grounded suggested rate (finding.rateSwitchTo). */
  toRate: string;
  /** Estimated annual savings, integer cents. */
  savingsCents: number;
  /** Pre-formatted dollar string of `savingsCents`, e.g. "$61,417.76" (the model renders THIS). */
  savingsDisplay: string;
  /** The opportunity category. The POC populates only rate switches; the union is future-proofing. */
  kind: "rate_switch" | "demand_charge" | "bill_audit" | "solar";
};

/** A per-meter projection carried for a generalized WORKBOOK codegen (Phase 3): the literal values a
 *  Meters/Summary tab can legitimately print, so the verifier's reverse scan allowlists them. The PDF
 *  codegen ignores this; it is additive. Money is integer cents, gated on coverage exactly like the
 *  dashboard table (an unreconciled meter's money is null, never a fabricated $0). */
export type SnapshotMeter = {
  id: string;
  name: string;
  /** The meter's rate schedule (digits mined into the allowlist), or null when unknown. */
  rate: string | null;
  /** Latest reconciled bill in integer cents, or null (unreconciled / no posted bill). */
  costCents: number | null;
  /** Latest reconciled demand charge in integer cents, or null. */
  demandCents: number | null;
};

/** The canonical snapshot the sandbox renders over and the verifier checks against. */
export type ReportSnapshot = {
  farm: { id: string; name: string };
  /** Total meters on the farm (the coverage denominator; an allowed structural number). */
  meterCount: number;
  /** The freshest BILLED cycle the figures reflect, ISO 8601, or null when no bill has posted. */
  coverageAsOf: string | null;
  totals: {
    /** Latest reconciled month spend in cents, or null when no meter is reconciled (never a fake $0). */
    latestMonthSpendCents: number | null;
    /** Sum of the shown opportunities' savings, integer cents. */
    rateSwitchSavingsCents: number;
    /** Coverage counts the Summary tab prints (structural integers; additive for Phase 3). */
    reconciledCount: number;
    needsReviewCount: number;
    noBillCount: number;
  };
  /** The top opportunities by savings (POC: rate switches), the report's subject + verification source. */
  opportunities: SnapshotOpportunity[];
  /** The per-meter projection a generalized workbook can print (Phase 3; additive). The PDF codegen
   *  does not read it, but its values are folded into the verifier allowlist. */
  meters: SnapshotMeter[];
};

/** The minimal meter shape the opportunity join needs (MeterView satisfies it). */
type OpportunityMeter = { id: string; name: string; rateSchedule: string | null };

/** A rate-switch opportunity before ranking/formatting. */
export type OpportunitySource = {
  meterName: string;
  fromRate: string | null;
  toRate: string;
  savingsCents: number;
};

/** The most opportunities the POC's "top 5" report shows. */
const TOP_OPPORTUNITIES = 5;

/**
 * Format integer cents as a US dollar string with cent precision and thousands separators, e.g.
 * 6_141_776 -> "$61,417.76". Deterministic and self-contained so the snapshot's display string and the
 * verifier's allowlist (which re-derives the same forms) can never drift. Exported for the verifier.
 */
export function formatCentsUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Extract the rate-switch opportunities from the farm's findings, joined to the meters in scope. Mirrors
 * the deterministic report skill's narrowing EXACTLY (src/lib/almond/skills/generate-report.ts
 * `readRateSwitch`): a finding qualifies only when it carries a grounded `rateSwitchTo` (the engine
 * wrote `action.kind === "switch_rate"` with `params.toSchedule`) AND a `meterId` that resolves to a
 * meter in scope. Savings is the finding's float-dollar `impactUsd` converted to a non-negative whole
 * cent — the same conversion the PDF's savings section uses, so the snapshot and that report agree.
 * Pure: no Prisma, no clock.
 */
export function extractOpportunities(
  meters: readonly OpportunityMeter[],
  findings: readonly FindingView[],
): OpportunitySource[] {
  const metersById = new Map(meters.map((m) => [m.id, m]));
  const out: OpportunitySource[] = [];
  for (const f of findings) {
    if (f.meterId === null || f.rateSwitchTo === null) continue;
    const meter = metersById.get(f.meterId);
    if (meter === undefined) continue; // finding for a meter outside the loaded set
    const savingsCents = Math.max(0, Math.round((f.impactUsd ?? 0) * 100));
    out.push({
      meterName: meter.name,
      fromRate: meter.rateSchedule,
      toRate: f.rateSwitchTo,
      savingsCents,
    });
  }
  return out;
}

/**
 * Compose the canonical snapshot from the already-extracted pieces. Ranks the opportunities by savings
 * (descending), caps to the top 5, assigns 1-based ranks + the pre-formatted display string, and sums
 * the SHOWN savings into the total (so `totals.rateSwitchSavingsCents` always equals the sum the
 * manifest can verify). Pure.
 */
export function composeReportSnapshot(args: {
  farm: { id: string; name: string };
  meterCount: number;
  coverageAsOf: string | null;
  latestMonthSpendCents: number | null;
  opportunities: readonly OpportunitySource[];
  /** The per-meter projection for the workbook codegen (Phase 3). Defaults to empty so the PDF
   *  codegen's existing callers/tests (which omit it) are unaffected. */
  meters?: readonly SnapshotMeter[];
  /** Coverage counts for the Summary tab. Default 0 (additive, back-compat). */
  coverage?: { reconciled: number; needsReview: number; noBill: number };
}): ReportSnapshot {
  const ranked = [...args.opportunities]
    .sort((a, b) => b.savingsCents - a.savingsCents)
    .slice(0, TOP_OPPORTUNITIES)
    .map(
      (o, i): SnapshotOpportunity => ({
        rank: i + 1,
        meterName: o.meterName,
        fromRate: o.fromRate,
        toRate: o.toRate,
        savingsCents: o.savingsCents,
        savingsDisplay: formatCentsUsd(o.savingsCents),
        kind: "rate_switch",
      }),
    );

  const coverage = args.coverage ?? { reconciled: 0, needsReview: 0, noBill: 0 };
  return {
    farm: args.farm,
    meterCount: args.meterCount,
    coverageAsOf: args.coverageAsOf,
    totals: {
      latestMonthSpendCents: args.latestMonthSpendCents,
      rateSwitchSavingsCents: ranked.reduce((sum, o) => sum + o.savingsCents, 0),
      reconciledCount: coverage.reconciled,
      needsReviewCount: coverage.needsReview,
      noBillCount: coverage.noBill,
    },
    opportunities: ranked,
    meters: [...(args.meters ?? [])],
  };
}

/**
 * Build the canonical snapshot for a farm: load the grounded meters + findings, derive the spend /
 * coverage state with the same pure helpers the dashboard and export use, and compose. Scope (`farmId`)
 * is inherited from `deps`, never an argument. The single read path the code-gen skill hands the
 * sandbox.
 */
export async function buildReportSnapshot(deps: AlmondToolDeps): Promise<ReportSnapshot> {
  const [meters, findings] = await Promise.all([
    loadMetersForFarm(deps.prisma, deps.farmId),
    loadFindings(deps.prisma, deps.farmId),
  ]);
  const state = summarizeExportState(meters);
  // Mirror the report summary section: the KPI spend counts only reconciled meters, so with none
  // reconciled there is no loaded spend to state — null, never a fabricated $0.
  const latestMonthSpendCents =
    state.coverage.reconciled === 0 ? null : computeKpiStrip([...meters]).spend.cents;

  // The per-meter projection for the workbook codegen: the SAME coverage-gated money the dashboard
  // table / deterministic workbook print (toMeterRow, AR-15), so the verifier allowlists exactly the
  // values a Meters/Summary tab can legitimately show.
  const meterProjection: SnapshotMeter[] = meters.map((m) => {
    const row = toMeterRow(m);
    return { id: m.id, name: row.name, rate: row.rate, costCents: row.costCents, demandCents: row.demandCents };
  });

  return composeReportSnapshot({
    farm: { id: deps.farmId, name: deps.farmName },
    meterCount: meters.length,
    coverageAsOf: state.asOf,
    latestMonthSpendCents,
    opportunities: extractOpportunities(meters, findings),
    meters: meterProjection,
    coverage: {
      reconciled: state.coverage.reconciled,
      needsReview: state.coverage.needsReview,
      noBill: state.coverage.noBill,
    },
  });
}
