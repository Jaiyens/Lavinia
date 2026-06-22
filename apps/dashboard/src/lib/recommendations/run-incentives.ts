// The rebate / incentive runner: the DB edge that turns a farm's persisted meters into
// honest-blank, display-only incentive Recommendations through the pure matcher in
// src/lib/incentives/match.ts. Mirrors run-solar-insight.ts's contract: an explicit
// PrismaClient, idempotent (clears this farm's PENDING 'rebate' recs and re-inserts inside one
// transaction), tenant-scoped on farmId, resolved-finding dedupe so an incentive the grower
// already dismissed never resurrects.
//
// OWNS ONLY tool 'rebate'. It never runs runEngines / runRateLever / runSolarInsight and never
// touches another tool's rows - this is a POST-PROCESSOR that READS persisted meters and
// writes its own tool key. No dollar is ever written (impactUsd is always null): a rebate's
// value needs interval data + the deterministic engines this agent does not run.

import type { Prisma, PrismaClient } from "@prisma/client";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadRateCard } from "@/lib/pge/rate-card";
import { matchIncentives, INCENTIVE_TOOL, type IncentiveMeter } from "@/lib/incentives/match";
import type { DraftRecommendation } from "./types";

/** The `tool` tag this runner owns. Re-exported from the matcher's single source so callers
 *  (the agent, tests) can import it from either place. */
export { INCENTIVE_TOOL };

export type RunIncentivesResult = {
  created: number;
};

/** A stable identity for a finding, to keep resolved (dismissed/done) responses sticky.
 *  Keyed on programId + pumpId, the two params the matcher writes. */
function findingKey(programId: unknown, pumpId: unknown): string {
  return [
    typeof programId === "string" ? programId : "",
    typeof pumpId === "string" ? pumpId : "",
  ].join("|");
}

/**
 * Run the incentive matcher over a farm's persisted meters and persist the qualifying
 * honest-blank findings. Severity is `watch` (a thing to look into, not a dollar at stake) and
 * impactUsd is always null. Idempotent and tool-scoped: a re-run clears only this farm's
 * PENDING 'rebate' recs and re-inserts, and a dismissed (programId, pumpId) match never comes
 * back.
 */
export async function runIncentives(
  prisma: PrismaClient,
  farmId: string,
  asOf = "2026-06-09T12:00:00.000Z",
): Promise<RunIncentivesResult> {
  const card = loadRateCard();
  const meters = await loadMetersForFarm(prisma, farmId);

  // Sticky responses: a match the farmer already answered (dismissed/done) must not return.
  const resolved = await prisma.recommendation.findMany({
    where: { farmId, tool: INCENTIVE_TOOL, status: { not: "pending" } },
    select: { action: true },
  });
  const resolvedKeys = new Set(
    resolved.flatMap((r) => {
      const action = r.action as
        | { kind?: unknown; params?: { programId?: unknown; pumpId?: unknown } }
        | null;
      return action?.kind === "review_incentive"
        ? [findingKey(action.params?.programId, action.params?.pumpId)]
        : [];
    }),
  );

  // Project the canonical MeterView down to the matcher's small input shape. The matcher owns
  // the dr.ts de-dupe by reading each meter's printed line items itself.
  const incentiveMeters: IncentiveMeter[] = meters.map((m) => ({
    id: m.id,
    name: m.name,
    scheduleLabel: m.rateSchedule,
    isSolar: m.isSolar,
    lineItems: m.periods.flatMap((p) => p.lineItems.map((li) => ({ label: li.label }))),
  }));

  const all = matchIncentives({ farmId, meters: incentiveMeters, card, asOf });

  // Drop matches the farmer already resolved (the sticky dedupe on programId + pumpId).
  const drafts: DraftRecommendation[] = all.filter((d) => {
    const params = d.action.params as { programId?: unknown; pumpId?: unknown } | undefined;
    return !resolvedKeys.has(findingKey(params?.programId, params?.pumpId));
  });

  await prisma.$transaction([
    prisma.recommendation.deleteMany({
      where: { farmId, tool: INCENTIVE_TOOL, status: "pending" },
    }),
    ...(drafts.length > 0
      ? [
          prisma.recommendation.createMany({
            data: drafts.map((d) => ({
              farmId: d.farmId,
              tool: d.tool,
              situation: d.situation,
              action: d.action as unknown as Prisma.InputJsonValue,
              impactUsd: null, // never a dollar
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
