// The tracked-results read edge (Story 4.2, FR-20). Projects the dashboard farm's
// ACCEPTED recommendations (status "done") into per-meter ResultView[] for the meter
// drawer's "What happened" section: predicted (frozen at acceptance) vs the realized
// number from the first bill that posts after acceptance, or pending until then.
//
// Mirrors findings.ts: a thin DB edge taking an explicit PrismaClient, narrowing the
// Json `action`/`result` columns defensively (a malformed row is skipped, never
// throws the drawer down), and delegating the math to the pure result.ts. Accepted
// recs deliberately leave the findings RAIL (loadFindings is pending-only); this is
// their surface.
//
// MeterPeriodView carries no printed cycle close, so the post date falls back to the
// metered period end (`close`) - a conservative, honest proxy for "when the bill
// posted" (see resultViewFor / firstPostedBillAfter).

import type { PrismaClient } from "@prisma/client";
import { resultViewFor, type ResultPeriod, type ResultView } from "@/lib/recommendations/result";
import type { MeterView } from "./load";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The Pump cuid the rec is about, from action.params.pumpId; null when fleet-level. */
function readPumpId(action: unknown): string | null {
  if (!isObject(action)) return null;
  const params = isObject(action.params) ? action.params : null;
  if (params === null) return null;
  return typeof params.pumpId === "string" && params.pumpId !== "" ? params.pumpId : null;
}

/** The prediction frozen at acceptance, from result.predictedUsd; null when none. */
function readPredictedUsd(result: unknown): number | null {
  if (!isObject(result)) return null;
  const p = result.predictedUsd;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

function toResultPeriod(period: { close: string; printedTotalCents: number | null }): ResultPeriod {
  return { close: period.close, printedTotalCents: period.printedTotalCents };
}

/**
 * Load the farm's accepted recommendations as per-meter ResultViews. Takes the
 * already-loaded meters so the realize step has each meter's billing periods without
 * a second query. A rec with no meter linkage (fleet-level) has no meter surface and
 * is skipped; a rec missing its acceptance instant cannot be timed against a bill and
 * is skipped (defense in depth - a "done" row always has resolvedAt).
 */
export async function loadTrackedResults(
  prisma: PrismaClient,
  farmId: string,
  meters: readonly MeterView[],
): Promise<Record<string, ResultView[]>> {
  const rows = await prisma.recommendation.findMany({
    where: { farmId, status: "done" },
    orderBy: { resolvedAt: "asc" },
    select: { id: true, situation: true, action: true, result: true, resolvedAt: true },
  });

  const periodsByMeter = new Map(
    meters.map((m) => [m.id, m.periods.map(toResultPeriod)]),
  );

  const out: Record<string, ResultView[]> = {};
  for (const row of rows) {
    const meterId = readPumpId(row.action);
    if (meterId === null) continue;
    if (row.resolvedAt === null) continue;
    const view = resultViewFor({
      id: row.id,
      situation: row.situation,
      predictedUsd: readPredictedUsd(row.result),
      resolvedAtIso: row.resolvedAt.toISOString(),
      periods: periodsByMeter.get(meterId) ?? [],
    });
    (out[meterId] ??= []).push(view);
  }
  return out;
}
