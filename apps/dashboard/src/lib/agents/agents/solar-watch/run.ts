// The solar-watch agent (kind "solar_watch", monthly, NO LLM, NO approval gate). Once a month
// it reads a farm's printed NEM statements, derives a per-array generation PROXY, and for any
// solar-paired meter whose export is slowly down season over season it surfaces an honest
// "worth a look" finding. Low stakes, so it is delivered as a finding (status "pending"),
// not as a proposed action behind the owner approval gate.
//
// ENGINE-OWNERSHIP / COLLISION RULES honored (critical):
//   - runEngines (run by the foundation's refresh agent) OWNS SOLAR_TOOL ("solar") on these
//     farms. This agent therefore does NOT call runSolarInsight, runRateLever, runSolarInsight,
//     or runEngines, and NEVER writes a SOLAR_TOOL row. It writes under its OWN tool key,
//     SOLAR_WATCH_TOOL ("solar-watch"), with its own delete-pending-then-create scoped strictly
//     to that key, so it can never clash with runEngines' SOLAR_TOOL re-run (the two own
//     disjoint key spaces and may run on the same farm without stepping on each other).
//
// HONEST SCOPE: seasonal underperformance only, from a net-export proxy (see generation-series.ts).
// Real-time outage / soiling detection needs 15-minute generation intervals and an irradiance
// model that does not exist on this base; that is future work and the copy says so.
//
// DEMO GUARD (ADR-S05): a demo farm's solar findings are owned by runEngines (the demo-interval
// engine), so this agent skips demo farms entirely, exactly as the dispatcher's farm selection
// already does. The guard here is belt-and-suspenders for a manual trigger.
//
// IDEMPOTENT: delete this farm's PENDING solar-watch recs then re-insert, and never resurrect a
// finding the grower already resolved (a meter whose last solar-watch finding is dismissed/done
// is skipped). Resilience: any throw closes the run "failed" with the reason and is NOT
// re-thrown, so the dispatcher's sweep over the other farms continues.

import type { Prisma, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { draftRecommendation } from "@/lib/recommendations";
import type { DraftRecommendation } from "@/lib/recommendations";
import { register } from "../../registry";
import { startAgentRun, recordAgentAction, completeAgentRun } from "../../run";
import {
  agingArrayFlag,
  loadArrayGenerationSeries,
  type AgingArrayFlag,
} from "./generation-series";

/**
 * The tool key this agent OWNS, distinct from SOLAR_TOOL ("solar") which runEngines owns. Only
 * solar-watch rows carry this tag, and only this agent clears/replaces them, so the two engines
 * never collide on a farm they both run for.
 */
export const SOLAR_WATCH_TOOL = "solar-watch";

/** The machine verb on a solar-watch finding's action (displayed via en.ts). */
export const INVESTIGATE_ARRAY_KIND = "investigate_array";

/** The audit action kind recorded against each underperforming array. */
export const FLAG_UNDERPERFORMANCE_KIND = "flag_underperformance";

/** A whole-percent proxy for the worst same-month-last-year shortfall, for the copy. */
function worstPercent(flag: AgingArrayFlag): number {
  return Math.round(flag.worstShortfallFraction * 100);
}

/**
 * Run the solar-watch agent for one farm. Opens a run, derives each solar meter's generation
 * proxy, flags the slowly-underperforming arrays (skipping any whose finding the grower already
 * resolved), persists the findings under SOLAR_WATCH_TOOL, records one audit action per flagged
 * array, and closes the run. Farm-scoped throughout; cron has no user session so triggeredBy is
 * "cron". `asOf` is injectable so the db test pins the createdAt.
 */
export async function runSolarWatchForFarm(
  prisma: PrismaClient,
  farmId: string,
  asOf = "2026-06-22T12:00:00.000Z",
): Promise<void> {
  // DEMO GUARD: a demo farm's solar is owned by runEngines. The dispatcher already excludes
  // demo farms; this re-check makes a manual call safe too. Never opens a run for a demo farm.
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { isDemo: true },
  });
  if (farm === null || farm.isDemo) return;

  const run = await startAgentRun(prisma, {
    farmId,
    kind: "solar_watch",
    triggeredBy: "cron",
  });

  try {
    const arrays = await loadArrayGenerationSeries(prisma, farmId);

    // Sticky responses: a solar-watch finding the grower already answered (dismissed/done/
    // overridden) must not come back. Keyed by the meter the finding named.
    const resolved = await prisma.recommendation.findMany({
      where: { farmId, tool: SOLAR_WATCH_TOOL, status: { not: "pending" } },
      select: { action: true },
    });
    const resolvedPumpIds = new Set(
      resolved.flatMap((r) => {
        const action = r.action as
          | { kind?: unknown; params?: { pumpId?: unknown } }
          | null;
        return action?.kind === INVESTIGATE_ARRAY_KIND &&
          typeof action.params?.pumpId === "string"
          ? [action.params.pumpId]
          : [];
      }),
    );

    // Build the drafts plus the (meter, flag) pairs we will record audit actions for.
    const flagged: { pumpId: string; pumpName: string; flag: AgingArrayFlag }[] = [];
    const drafts: DraftRecommendation[] = [];
    for (const array of arrays) {
      if (resolvedPumpIds.has(array.pumpId)) continue; // grower already handled this array
      const flag = agingArrayFlag(array.series);
      if (flag === null) continue; // < 6 months or no sustained shortfall -> silent
      flagged.push({ pumpId: array.pumpId, pumpName: array.pumpName, flag });
      drafts.push(
        draftRecommendation({
          tool: SOLAR_WATCH_TOOL,
          farmId,
          severity: "watch",
          createdAt: asOf,
          situation: en.agents.solarWatch.situation(array.pumpName),
          // No impactUsd: this is a proxy signal, not a dollar claim; it must not inflate the
          // findings rail's at-risk sum. The proxy magnitude lives in the note only.
          impactNote: en.agents.solarWatch.note(worstPercent(flag), flag.monthsCounted),
          action: {
            kind: INVESTIGATE_ARRAY_KIND,
            label: en.agents.solarWatch.action,
            params: {
              pumpId: array.pumpId,
              solarKw: array.solarKw,
              monthsCounted: flag.monthsCounted,
              worstShortfallFraction: flag.worstShortfallFraction,
              shortfallPairs: flag.shortfallPairs.length,
            },
            execute: null,
          },
        }),
      );
    }

    // Idempotent persist scoped to OUR key only: clear this farm's pending solar-watch recs,
    // then insert the fresh set. Never touches SOLAR_TOOL, so runEngines' solar findings are
    // untouched. One transaction so a reader never sees a half-cleared set.
    await prisma.$transaction([
      prisma.recommendation.deleteMany({
        where: { farmId, tool: SOLAR_WATCH_TOOL, status: "pending" },
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

    // Record one audit action per flagged array, linked to the finding it surfaced. There is NO
    // approval gate (this is a finding, not a proposed action): we record it as an audit trail
    // of what the agent surfaced. We re-read the freshly-created rec ids by (farm, tool, kind,
    // pumpId) so each action links to its finding.
    if (flagged.length > 0) {
      const createdRecs = await prisma.recommendation.findMany({
        where: { farmId, tool: SOLAR_WATCH_TOOL, status: "pending" },
        select: { id: true, action: true },
      });
      const recIdByPump = new Map<string, string>();
      for (const rec of createdRecs) {
        const action = rec.action as { params?: { pumpId?: unknown } } | null;
        const pid = action?.params?.pumpId;
        if (typeof pid === "string") recIdByPump.set(pid, rec.id);
      }
      for (const f of flagged) {
        await recordAgentAction(prisma, {
          agentRunId: run.id,
          farmId,
          recommendationId: recIdByPump.get(f.pumpId) ?? null,
          kind: FLAG_UNDERPERFORMANCE_KIND,
          summary: en.agents.solarWatch.situation(f.pumpName),
        });
      }
    }

    await completeAgentRun(prisma, run.id, { status: "succeeded" });
  } catch (e) {
    const note = e instanceof Error ? e.message : "Solar watch could not finish.";
    await completeAgentRun(prisma, run.id, { status: "failed", note });
  }
}

register({
  kind: "solar_watch",
  label: en.agents.solarWatch.label,
  trigger: "cron",
  cadence: "monthly",
  run: runSolarWatchForFarm,
});
