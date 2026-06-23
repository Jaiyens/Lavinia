// The rate-lever runner (Story 3.3, FR-14): the DB edge that turns a farm's
// reconciled bills into persisted rate-switch Recommendations through the pure
// lever in src/lib/energy/rate-lever.ts. Mirrors run.ts's contract: takes a
// PrismaClient, idempotent (clears this farm's PENDING rate-optimization recs and
// re-inserts inside one transaction), never touches other tools' rows or anything
// the farmer already resolved. Also backfills Pump.isLegacy from the schedule
// mapping, so the table's legacy column finally reflects the AG4/AG5 rate codes
// (the Epic-1 import gap recorded in deferred-work.md).
//
// Never run this and runEngines (the demo-interval engine) against the SAME farm:
// both own the rate-optimization tool key.

import type { Prisma, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { rateLever } from "@/lib/energy/rate-lever";
import { backTestTolerance } from "@/lib/energy/back-test-config";
import { reconcileMeter } from "@/lib/energy/back-test-report";
import { logReconciliation } from "@/lib/energy/back-test-log";
import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { isSolarNemMeter } from "@/lib/energy/solar-meter";
import { loadRateCard } from "@/lib/pge/rate-card";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { formatUsdWhole } from "@/lib/format/money";
import { draftRecommendation } from "./build";
import type { DraftRecommendation } from "./types";

export type RunRateLeverResult = {
  created: number;
  estimates: number;
  qualitative: number;
  legacyFlagged: number;
};

/** "2026-03-01" -> "March 1, 2026" for the grower-facing estimate line. */
function formatEffectiveDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The schedule name the grower recognizes: the bill's own print, first token. */
function printedScheduleName(stored: string): string {
  return stored.trim().split(/\s+/)[0] ?? stored.trim();
}

/** A stable identity for a finding, to keep resolved responses sticky. */
function findingKey(kind: string, pumpId: unknown, to: unknown): string {
  return [kind, typeof pumpId === "string" ? pumpId : "", typeof to === "string" ? to : ""].join("|");
}

/**
 * Run the rate-optimization lever over a farm's reconciled billing and persist
 * the findings. Solar meters are never PRICED (their NEM economics net
 * generation against use, and their monthly charge pages omit the energy that
 * settles at true-up - a counterfactual from those pages would mislead): a solar
 * legacy meter still gets the qualitative closed-rate finding with the honest
 * solar note, a solar current meter stays silent. The real account carries 14
 * NEM generating SAs (flagged isSolar by the importer).
 */
export async function runRateLever(
  prisma: PrismaClient,
  farmId: string,
  asOf = "2026-06-09T12:00:00.000Z",
): Promise<RunRateLeverResult> {
  const card = loadRateCard();
  const meters = await loadMetersForFarm(prisma, farmId);

  // A finding the farmer already answered (done/dismissed/overridden) must not
  // resurrect as a fresh pending twin on the next run: the pending-clear below
  // only deletes pending rows, so without this the farmer's "Not now" would be
  // silently undone by every re-import.
  const resolved = await prisma.recommendation.findMany({
    where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: { not: "pending" } },
    select: { action: true },
  });
  const resolvedKeys = new Set(
    resolved.map((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown; to?: unknown } } | null;
      return findingKey(
        typeof action?.kind === "string" ? action.kind : "",
        action?.params?.pumpId,
        action?.params?.to,
      );
    }),
  );

  const drafts: DraftRecommendation[] = [];
  let estimates = 0;
  let qualitative = 0;
  const legacyUpdates: { pumpId: string; isLegacy: boolean }[] = [];

  for (const meter of meters) {
    // The shared solar/NEM predicate (widened to also catch a nemType-only meter): a solar
    // meter is never priced, its monthly charge pages omit the energy that settles at true-up.
    const isSolarMeter = isSolarNemMeter(meter);

    const result = rateLever(
      {
        scheduleLabel: meter.rateSchedule,
        // The gate only trusts line items that survived the cent reconciliation,
        // and never prices a solar meter's partial charge pages.
        periods:
          meter.coverageState === "reconciled" && !isSolarMeter ? meter.periods : [],
      },
      card,
    );

    // Per-meter reconciliation log (behind TERRA_RECONCILE_LOG): the same pure
    // back-test the gate just ran, surfaced for every reconciled non-solar meter
    // with its error and best-guess cause. reconcileMeter shares the lever's
    // engine, so the log can never disagree with the gate. Logging only; it
    // computes no figure of its own and changes nothing the lever decided.
    if (meter.coverageState === "reconciled" && !isSolarMeter) {
      logReconciliation(
        reconcileMeter({
          meter: {
            id: meter.id,
            name: meter.name,
            serviceId: meter.serviceId,
            rateSchedule: meter.rateSchedule,
          },
          periods: meter.periods,
          card,
          tolerance: backTestTolerance(),
        }),
      );
    }

    // Backfill the legacy flag whenever the mapping settled it.
    if (result.isLegacy !== null && result.isLegacy !== meter.isLegacy) {
      legacyUpdates.push({ pumpId: meter.id, isLegacy: result.isLegacy });
    }

    const from = printedScheduleName(meter.rateSchedule ?? "");

    if (result.kind === "estimate") {
      if (resolvedKeys.has(findingKey("switch_rate", meter.id, result.targetSchedule))) {
        continue; // the farmer already answered this exact switch
      }
      estimates += 1;
      drafts.push(
        draftRecommendation({
          tool: RATE_OPTIMIZATION_TOOL,
          farmId,
          severity: "act",
          createdAt: asOf,
          situation: en.rateOptimization.lever.situation(
            meter.name,
            from,
            result.targetSchedule,
          ),
          impactUsd: result.savingsCents / 100,
          impactNote: en.rateOptimization.lever.estimate(
            formatUsdWhole(result.savingsCents),
            result.daysBasis,
            from,
            result.targetSchedule,
            formatEffectiveDate(card.effectiveDate),
          ),
          action: {
            kind: "switch_rate",
            label: en.rateOptimization.action(result.targetSchedule),
            params: {
              pumpId: meter.id,
              from: result.currentSchedule,
              to: result.targetSchedule,
              savingsCents: result.savingsCents,
              currentCostCents: result.currentCostCents,
              targetCostCents: result.targetCostCents,
              daysBasis: result.daysBasis,
              cyclesTested: result.cyclesTested,
              deviationPct: result.aggregateDeviationPct,
              bandPct: result.bandPct,
              cardVersion: card.version ?? null,
              effectiveDate: card.effectiveDate,
            },
            execute: null,
          },
        }),
      );
    } else if (result.kind === "qualitative") {
      if (resolvedKeys.has(findingKey("review_rate", meter.id, ""))) {
        continue; // the farmer already answered the review prompt for this meter
      }
      qualitative += 1;
      // The note states the true reason: solar billing settles at true up;
      // no_savings means the bills MATCHED and no cheaper current rate showed;
      // otherwise the bills could not be matched closely enough.
      const note = isSolarMeter
        ? en.rateOptimization.lever.legacySolarNote()
        : result.reason === "no_savings"
          ? en.rateOptimization.lever.legacyNoSavingsNote()
          : en.rateOptimization.lever.legacyNote();
      drafts.push(
        draftRecommendation({
          tool: RATE_OPTIMIZATION_TOOL,
          farmId,
          severity: "watch",
          createdAt: asOf,
          situation: en.rateOptimization.lever.legacySituation(meter.name, from),
          impactNote: note,
          action: {
            kind: "review_rate",
            label: en.rateOptimization.lever.legacyAction(),
            params: {
              pumpId: meter.id,
              from: result.currentSchedule,
              reason: isSolarMeter ? "solar_true_up_pending" : result.reason,
            },
            execute: null,
          },
        }),
      );
    }
  }

  // One transaction: the pending-clear, the inserts, and the legacy backfill land
  // together or not at all (no window where the rail reads a half-replaced feed).
  await prisma.$transaction([
    prisma.recommendation.deleteMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
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
    ...legacyUpdates.map((u) =>
      prisma.pump.update({ where: { id: u.pumpId }, data: { isLegacy: u.isLegacy } }),
    ),
  ]);

  return {
    created: drafts.length,
    estimates,
    qualitative,
    legacyFlagged: legacyUpdates.filter((u) => u.isLegacy).length,
  };
}
