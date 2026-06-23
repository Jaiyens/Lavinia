// The rebate / incentive agent (NO LLM, NO approval gate, monthly). It is a POST-PROCESSOR:
// it READS the farm's already-persisted meters and writes ONLY its own 'rebate' tool key
// (via runIncentives). It NEVER runs runEngines / runRateLever / runSolarInsight (each owns a
// different tool key) and never re-pulls PG&E. Programs change on a monthly-ish cadence, not
// daily, so the cadence is "monthly".
//
// What it records: it runs the deterministic match, then records ONE audit action per
// persisted match (kind "flag_incentive"), each linked to the Recommendation it flagged. The
// matches are honest-blank, display-only findings (no dollar, execute null) and the agent has
// NO approval gate - these are informational program leads the grower reviews, not a command
// to approve. completeAgentRun closes the run; any throw closes it "failed" and is NOT
// re-thrown, so the dispatcher's sweep over the other farms continues.

import type { PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { runIncentives, INCENTIVE_TOOL } from "@/lib/recommendations/run-incentives";
import { register } from "../../registry";
import { startAgentRun, recordAgentAction, completeAgentRun } from "../../run";

/**
 * Run the rebate agent for one farm: open a run, match incentives (persist the honest-blank
 * 'rebate' findings), record one audit action per match, then close the run "succeeded". Any
 * throw closes it "failed" with the reason and is swallowed (the per-farm isolation rule).
 * Farm-scoped throughout; cron has no user session, so triggeredBy is "cron".
 */
export async function runRebateForFarm(
  prisma: PrismaClient,
  farmId: string,
): Promise<void> {
  const run = await startAgentRun(prisma, {
    farmId,
    kind: "rebate",
    triggeredBy: "cron",
  });
  try {
    await runIncentives(prisma, farmId);

    // Read back the matches this farm now carries so each audit action links the finding it
    // flagged (the recommendationId chain), farmId-scoped.
    const matches = await prisma.recommendation.findMany({
      where: { farmId, tool: INCENTIVE_TOOL, status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, situation: true },
    });
    for (const match of matches) {
      await recordAgentAction(prisma, {
        agentRunId: run.id,
        farmId,
        recommendationId: match.id,
        kind: "flag_incentive",
        summary: match.situation,
      });
    }

    await completeAgentRun(prisma, run.id, { status: "succeeded" });
  } catch (e) {
    const note = e instanceof Error ? e.message : en.agents.incentives.failedNote;
    await completeAgentRun(prisma, run.id, { status: "failed", note });
  }
}

register({
  kind: "rebate",
  label: en.agents.incentives.label,
  trigger: "cron",
  cadence: "monthly",
  run: runRebateForFarm,
});
