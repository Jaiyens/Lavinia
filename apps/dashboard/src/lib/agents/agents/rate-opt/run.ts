// The rate optimization agent (kind "rate_switch", NO LLM, RECOMMEND-ONLY). Daily, it is a
// pure POST-PROCESSOR over the switch_rate findings runEngines ALREADY produced. It does NOT
// run runEngines / runRateLever / runSolarInsight (each owns the rate-optimization tool key;
// re-running any would clash on it). It only READS this farm's pending switch_rate
// Recommendation rows and, for each wrong-rate finding it has not already surfaced, records a
// "proposed" AgentAction the founder sees in the /agents audit UI. Nothing auto-switches; the
// recorded action's execute hook stays null (the human files the real PG&E change).
//
// ENGINE OWNERSHIP honored: this is a post-processor. The SOLE writer of switch_rate
// Recommendations is runEngines (via src/lib/energy/rate-compare.ts, which stamps
// action.kind === "switch_rate" with params.pumpId / params.toSchedule / params.fromSchedule
// and impactUsd === the annual switch saving). We read those rows; we never produce them.
//
// CRITIC FIX (idempotent daily sweep): runEngines clears+re-inserts its PENDING rows on every
// pass, so Recommendation.id is NOT stable across sweeps. We therefore dedupe on the STABLE
// finding key pumpId+toSchedule, read off the proposedCommand we already stored, so a standing
// wrong-rate finding is proposed ONCE and a daily re-run never re-proposes it. A finding the
// owner already requested (an executed/approved action) is likewise never re-proposed.
//
// RESILIENCE: the per-farm work is wrapped so a thrown error records a "failed" AgentRun and is
// swallowed; it never aborts the dispatcher's sweep over the other farms.

import type { PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { usd } from "@/copy/en";
import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { register } from "../../registry";
import { startAgentRun, recordAgentAction, completeAgentRun } from "../../run";

/** The agent's own action kind (the AgentAction.kind vocabulary, distinct from the
 *  Recommendation's "switch_rate" action verb). */
export const REQUEST_RATE_SWITCH_KIND = "request_rate_switch";

/** The grounded fields a switch_rate finding's action.params carries (rate-compare.ts).
 *  Narrowed defensively off the stored Json so a malformed row is skipped, never thrown. */
type SwitchRateParams = {
  pumpId: string;
  pumpName: string | null;
  fromSchedule: string | null;
  toSchedule: string;
};

/** The stable proposed-command we persist on the AgentAction. pumpId+toSchedule is the dedupe
 *  key (NOT the Recommendation.id, which a re-sweep changes); impactUsd freezes the engine's
 *  predicted annual saving so the request records exactly what was proposed. */
export type RateSwitchCommand = {
  pumpId: string;
  toSchedule: string;
  fromSchedule: string | null;
  impactUsd: number | null;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Read the grounded rate-switch params off a stored Recommendation.action, or null when the
 *  row is not a readable switch_rate finding (wrong kind, missing pump or target). Reads the
 *  machine verb action.kind === "switch_rate" and params.toSchedule (what rate-compare.ts
 *  writes), never the farmer-facing label, whose copy ("Move it to AG-B") omits "switch". */
export function readSwitchRateParams(action: unknown): SwitchRateParams | null {
  if (!isObject(action) || action.kind !== "switch_rate") return null;
  const params = isObject(action.params) ? action.params : null;
  if (params === null) return null;
  const pumpId = nonEmpty(params.pumpId);
  const toSchedule = nonEmpty(params.toSchedule);
  if (pumpId === null || toSchedule === null) return null;
  return {
    pumpId,
    pumpName: nonEmpty(params.pumpName),
    fromSchedule: nonEmpty(params.fromSchedule),
    toSchedule,
  };
}

/** The stable dedupe identity for a wrong-rate finding: the pump plus the target rate. Two
 *  findings that propose the SAME pump onto the SAME target rate are the same standing
 *  finding, even across a runEngines re-sweep that minted new Recommendation ids. */
export function rateSwitchKey(pumpId: string, toSchedule: string): string {
  return `${pumpId}|${toSchedule}`;
}

/** Read the stable key off a previously stored proposedCommand (best effort; an unreadable
 *  command yields null so it never blocks a fresh proposal). */
function keyFromCommand(command: unknown): string | null {
  if (!isObject(command)) return null;
  const pumpId = nonEmpty(command.pumpId);
  const toSchedule = nonEmpty(command.toSchedule);
  if (pumpId === null || toSchedule === null) return null;
  return rateSwitchKey(pumpId, toSchedule);
}

/**
 * Run the rate optimization agent for ONE farm. Opens a run, loads this farm's pending
 * switch_rate findings, and for each one NOT already surfaced (by the stable pumpId+toSchedule
 * key across this farm's prior rate-switch actions) records a "proposed" action carrying the
 * stable command + frozen impact. Closes the run "succeeded" with counts, or "failed" on a
 * throw (swallowed so the dispatcher sweep continues). Farm-scoped throughout; triggeredBy is
 * "cron" (the system sweep has no user session).
 */
export async function runRateOptForFarm(
  prisma: PrismaClient,
  farmId: string,
): Promise<void> {
  const run = await startAgentRun(prisma, {
    farmId,
    kind: "rate_switch",
    triggeredBy: "cron",
  });
  try {
    // The wrong-rate findings the engines already proved (pending, this farm, the rate tool).
    const recs = await prisma.recommendation.findMany({
      where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" },
      select: { id: true, action: true, impactUsd: true, situation: true },
      orderBy: { createdAt: "asc" },
    });

    // Every rate-switch action we have ALREADY recorded for this farm (any status). Their
    // stored proposedCommand carries the stable key, so a standing finding is proposed once.
    const priorActions = await prisma.agentAction.findMany({
      where: { farmId, kind: REQUEST_RATE_SWITCH_KIND },
      select: { proposedCommand: true },
    });
    const alreadyProposed = new Set<string>();
    for (const a of priorActions) {
      const key = keyFromCommand(a.proposedCommand);
      if (key !== null) alreadyProposed.add(key);
    }

    let proposed = 0;
    // Guard against two pending rows resolving to the same key in a single sweep (defensive;
    // runEngines de-dupes per pump, but a malformed feed should not double-record).
    const seenThisRun = new Set<string>();
    for (const rec of recs) {
      const params = readSwitchRateParams(rec.action);
      if (params === null) continue; // the review_legacy_fleet / unreadable row: not a switch
      const key = rateSwitchKey(params.pumpId, params.toSchedule);
      if (alreadyProposed.has(key) || seenThisRun.has(key)) continue;
      seenThisRun.add(key);

      const command: RateSwitchCommand = {
        pumpId: params.pumpId,
        toSchedule: params.toSchedule,
        fromSchedule: params.fromSchedule,
        impactUsd: rec.impactUsd,
      };
      const pumpName = params.pumpName ?? "This meter";
      const from = params.fromSchedule ?? "its current rate";
      const savings = usd(rec.impactUsd ?? 0);
      await recordAgentAction(prisma, {
        agentRunId: run.id,
        farmId,
        recommendationId: rec.id,
        kind: REQUEST_RATE_SWITCH_KIND,
        summary: en.agents.rateAgent.summary(pumpName, from, params.toSchedule, savings),
        proposedCommand: command,
      });
      proposed += 1;
    }

    await completeAgentRun(prisma, run.id, {
      status: "succeeded",
      note: `Proposed ${proposed} rate switch${proposed === 1 ? "" : "es"}.`,
    });
  } catch (e) {
    const note = e instanceof Error ? e.message : null;
    await completeAgentRun(prisma, run.id, { status: "failed", note });
  }
}

register({
  kind: "rate_switch",
  label: en.agents.rateAgent.label,
  trigger: "cron",
  cadence: "daily",
  run: runRateOptForFarm,
});
