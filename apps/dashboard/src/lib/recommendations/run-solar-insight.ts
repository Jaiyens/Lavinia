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
import { loadRateCard } from "@/lib/pge/rate-card";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { formatUsdWhole } from "@/lib/format/money";
import { draftRecommendation } from "./build";
import type { DraftRecommendation } from "./types";

export type RunSolarInsightResult = {
  created: number;
};

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

  // Sticky responses: an insight the farmer already answered must not come back.
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
