// The solar/NEM demand insight runner (Story 3.4, FR-15): persists the
// "solar does not cover the demand charge" explanation as a feed item for every
// meter that passes the pure gates (NEM solar + AG-C family + reconciled +
// demand owed). Mirrors run-rate-lever.ts's contract: explicit PrismaClient,
// idempotent delete-pending-then-insert scoped to SOLAR_TOOL, resolved-finding
// dedupe (a dismissed insight never resurrects), one transaction.
//
// Never run this and runEngines (the demo-interval engine) against the SAME
// farm: both own the solar tool key.

import type { Prisma, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { nemDemandInsight, SOLAR_TOOL } from "@/lib/energy/solar-nem";
import { auditAllocation } from "@/lib/energy/solar-allocation";
import { loadRateCard } from "@/lib/pge/rate-card";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { buildSolarDataset } from "@/lib/dashboard/solar";
import { formatUsdWhole } from "@/lib/format/money";
import { draftRecommendation } from "./build";
import type { DraftRecommendation } from "./types";

export type RunSolarInsightResult = {
  created: number;
};

/** Stable identity for an F3 aggregation finding: the meter plus the array it was scoped to (or "-"
 *  for the no-array dropped case). Used so a dismissed dropped/mismatched row never resurrects and a
 *  re-run is idempotent, the same delete-pending-then-insert + resolved-dedupe discipline as F2. */
function aggregationKey(pumpId: string, arrayId: string | null): string {
  return `${pumpId}::${arrayId ?? "-"}`;
}

/** The 1-12 calendar month of an injected ISO `asOf` (no clock read), for the dataset's next-true-up
 *  KPI. The audit itself does not depend on the month; the dataset just needs one to assemble. */
function monthOf(asOf: string): number {
  const parsed = new Date(asOf);
  const month = parsed.getUTCMonth() + 1;
  return Number.isFinite(month) ? month : 1;
}

/**
 * Run the NEM demand insight over a farm's persisted solar data and billing,
 * and persist the qualifying findings. Severity is `info` (an explanation, not
 * an action demand) and the demand dollar lives in the note, never in
 * `impactUsd` - the demand charge is money owed, not money at stake, and must
 * not inflate the rail's at-risk sum.
 */
export async function runSolarInsight(
  prisma: PrismaClient,
  farmId: string,
  asOf = "2026-06-09T12:00:00.000Z",
): Promise<RunSolarInsightResult> {
  const card = loadRateCard();
  const meters = await loadMetersForFarm(prisma, farmId);

  // Sticky responses: an insight the farmer already answered must not come back. Each emitter is
  // deduped against its own resolved identity: F2 (review_solar_demand) by pumpId; F3
  // (verify_aggregation, C-4) by the pumpId+arrayId pair the audit traced to, so dismissing one
  // dropped/mismatched row never silences another.
  const resolved = await prisma.recommendation.findMany({
    where: { farmId, tool: SOLAR_TOOL, status: { not: "pending" } },
    select: { action: true },
  });
  const resolvedPumpIds = new Set(
    resolved.flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
      return action?.kind === "review_solar_demand" &&
        typeof action.params?.pumpId === "string"
        ? [action.params.pumpId]
        : [];
    }),
  );
  const resolvedAggregationKeys = new Set(
    resolved.flatMap((r) => {
      const action = r.action as
        | { kind?: unknown; params?: { pumpId?: unknown; arrayId?: unknown } }
        | null;
      return action?.kind === "verify_aggregation" &&
        typeof action.params?.pumpId === "string" &&
        (action.params.arrayId === null || typeof action.params.arrayId === "string")
        ? [aggregationKey(action.params.pumpId, action.params.arrayId)]
        : [];
    }),
  );

  const drafts: DraftRecommendation[] = [];
  for (const meter of meters) {
    const insight = nemDemandInsight({
      isSolar: meter.isSolar,
      scheduleLabel: meter.rateSchedule,
      coverageState: meter.coverageState,
      nemMonths: meter.nemPeriods.map((m) => ({
        start: m.start,
        netKwh: m.netKwh,
        amountCents: m.amountCents,
      })),
      cycleDemandCents: meter.periods.map((p) => p.demandCents),
      trueUpAmountCents: meter.trueUpAmountCents,
      card,
    });
    if (insight === null) continue;
    if (resolvedPumpIds.has(meter.id)) continue;

    drafts.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId,
        severity: "info",
        createdAt: asOf,
        situation: en.solar.insight.situation(
          meter.name,
          en.solar.insight.positionPhrase(insight.position, insight.monthsCounted),
        ),
        impactNote: en.solar.insight.note(formatUsdWhole(insight.demandOwedCents)),
        action: {
          kind: "review_solar_demand",
          label: en.solar.insight.action(),
          params: {
            pumpId: meter.id,
            position: insight.position,
            demandOwedCents: insight.demandOwedCents,
            netKwh: insight.netKwh,
            nemChargesCents: insight.nemChargesCents,
            monthsCounted: insight.monthsCounted,
          },
          execute: null,
        },
      }),
    );
  }

  // F3 (C-4, FR9): the allocation audit. Assemble the solar dataset (the same array-group + needs-
  // review shape the Arrays lens renders, so a finding always traces to a meter/array visible on the
  // tab), then run the pure `auditAllocation` per array. Two honest gaps:
  //   - a solar meter linked to NO array is a dropped meter (its credits reach nowhere); it traces to
  //     the meter, with arrayId null (the array it should belong to is what the grower verifies).
  //   - a recorded share diverging from the load-implied share beyond ALLOCATION_TOLERANCE_PP is a
  //     mismatch; forward-compatible (no recorded-split field in the launch data yet), so it stays
  //     silent today and is proven by the audit's unit test.
  // The dollar is ALWAYS honest-blank (impactNote only, severity watch): a "verify with PG&E" signal,
  // never money at stake, so it never inflates the rail's at-risk sum (NFR5/NFR6).
  const dataset = buildSolarDataset(meters, monthOf(asOf));

  // A solar meter linked to no array is a dropped meter ONLY when an aggregation graph EXISTS on the
  // farm to be dropped from (FR9): a meter absent from arrays that DO exist is a real gap to verify. A
  // farm with no arrays at all has no aggregation graph, so a lone solar meter there is not "dropped"
  // (it surfaces in the Arrays-lens needs-review tray instead, C-1) - emitting an F3 there would be a
  // false finding. So the dropped-meter audit fires only when `dataset.arrays` is non-empty.
  if (dataset.arrays.length > 0) {
    for (const m of dataset.needsReview.unlinkedMeters) {
      const key = aggregationKey(m.id, null);
      if (resolvedAggregationKeys.has(key)) continue;
      drafts.push(
        draftRecommendation({
          tool: SOLAR_TOOL,
          farmId,
          severity: "watch",
          createdAt: asOf,
          situation: en.solar.aggregation.unlinkedSituation(m.name),
          impactNote: en.solar.aggregation.note,
          action: {
            kind: "verify_aggregation",
            label: en.solar.aggregation.action(),
            params: { pumpId: m.id, arrayId: null, reason: "dropped_meter" },
            execute: null,
          },
        }),
      );
    }
  }

  // Per-array audit: dropped meters (listed-but-unlinked, scoped to the array) and mismatched recorded
  // shares. The launch data carries no listed-but-unlinked-within-an-array signal nor a recorded-split
  // field, so both pass empty today and the loop is silent - correct, not broken. The full path is
  // proven by `auditAllocation`'s unit test; this wiring emits the moment that data lands.
  for (const group of dataset.arrays) {
    const result = {
      arrayId: group.id,
      arrayName: group.name,
      shares: group.meters.map((row) => ({
        pumpId: row.pumpId,
        meterName: row.meterName,
        share: row.share,
      })),
      notOnFilePumpIds: group.meters.filter((row) => row.share === null).map((row) => row.pumpId),
    };
    const findings = auditAllocation({ result, listedButUnlinked: [] });
    const meterNameByPump = new Map(group.meters.map((row) => [row.pumpId, row.meterName]));
    const arrayName = group.name ?? en.solar.aggregation.unnamedArray;
    for (const finding of findings) {
      const key = aggregationKey(finding.pumpId, finding.arrayId);
      if (resolvedAggregationKeys.has(key)) continue;
      const meterName = meterNameByPump.get(finding.pumpId) ?? finding.pumpId;
      const situation =
        finding.kind === "dropped_meter"
          ? en.solar.aggregation.droppedSituation(meterName, arrayName)
          : en.solar.aggregation.mismatchedSituation(
              meterName,
              arrayName,
              finding.computedPct,
              finding.recordedPct,
            );
      drafts.push(
        draftRecommendation({
          tool: SOLAR_TOOL,
          farmId,
          severity: "watch",
          createdAt: asOf,
          situation,
          impactNote: en.solar.aggregation.note,
          action: {
            kind: "verify_aggregation",
            label: en.solar.aggregation.action(),
            params: { pumpId: finding.pumpId, arrayId: finding.arrayId, reason: finding.kind },
            execute: null,
          },
        }),
      );
    }
  }

  await prisma.$transaction([
    prisma.recommendation.deleteMany({
      where: { farmId, tool: SOLAR_TOOL, status: "pending" },
    }),
    ...(drafts.length > 0
      ? [
          prisma.recommendation.createMany({
            data: drafts.map((d) => ({
              farmId: d.farmId,
              tool: d.tool,
              situation: d.situation,
              action: d.action as unknown as Prisma.InputJsonValue,
              impactUsd: d.impactUsd ?? null,
              impactNote: d.impactNote ?? null,
              severity: d.severity,
              status: d.status,
              createdAt: new Date(d.createdAt),
            })),
          }),
        ]
      : []),
  ]);

  return { created: drafts.length };
}
