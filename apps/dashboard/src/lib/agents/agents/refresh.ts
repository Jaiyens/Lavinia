// The built-in refresh agent (NO LLM). Daily, it does for a real connected farm EXACTLY
// what the onboarding finalize does — re-pull the live PG&E data, then re-run the engines —
// so a farm's findings stay current without the grower re-doing onboarding. This is the
// ONLY agent the foundation ships; the four feature agents register from their own files.
//
// CANONICAL REFRESH SEQUENCE (must equal onboarding):
//   The live onboarding finalize (src/app/(app)/onboarding/actions.ts) does:
//     saveConfirmationAction -> runEngines(prisma, farmId)
//     connectSampleAction    -> addPgeFeed + activate + runEngines(prisma, farmId)
//     finishPgeConnectAction -> importUtilityApiIntoFarm(prisma, farmId, {force?})
//   There is NO `safeRunEngines` wrapper on this base; the finalize calls runEngines bare.
//   So the canonical refresh for a real farm is: re-pull (importUtilityApiIntoFarm, force
//   false) THEN runEngines. We reproduce that precisely here.
//
// ENGINE-OWNERSHIP RULES honored:
//   - runEngines OWNS the rate, solar, demand-charge AND bill-audit tool keys; it is the
//     ONLY engine entry the live onboarding path uses. We therefore call runEngines and
//     NEVER runRateLever (the runEngines-XOR-runRateLever rule: both own the rate key) and
//     NEVER runSolarInsight (runEngines already owns the solar key on a runEngines farm).
//     runRateLever / runSolarInsight are the ALTERNATE Batth real-meter analysis path and
//     are not part of the live onboarding finalize, so they are intentionally NOT called.
//   - Because runEngines includes billAudit (run.ts), a real farm DOES get a bill audit on
//     every refresh today, through this same path (see the report note).
//
// RESILIENCE: per-farm work is wrapped so a thrown error (e.g. PG&E MFA expired the
// authorization, so the re-pull throws) records a "failed" AgentRun and is swallowed — it
// never aborts the dispatcher's sweep over the other farms.

import type { PrismaClient } from "@prisma/client";
import { importUtilityApiIntoFarm } from "@/lib/onboarding/farm";
import { runEngines } from "@/lib/recommendations/run";
import { en } from "@/copy/en";
import { register } from "../registry";
import { startAgentRun, completeAgentRun } from "../run";

/**
 * Refresh one farm: open a run, re-pull the live PG&E data (non-forced, so a partial pull
 * does not overwrite good data), re-run the engines, then close the run "succeeded". Any
 * throw closes it "failed" with the reason and is NOT re-thrown, so the dispatcher's sweep
 * over the remaining farms continues. Farm-scoped throughout; cron has no user session, so
 * triggeredBy is "cron".
 */
export async function runRefreshForFarm(
  prisma: PrismaClient,
  farmId: string,
): Promise<void> {
  const run = await startAgentRun(prisma, {
    farmId,
    kind: "refresh",
    triggeredBy: "cron",
  });
  try {
    // Re-pull the live authorization. force:false means a still-collecting pull returns
    // null (no overwrite) rather than importing a partial — same as the connecting screen.
    await importUtilityApiIntoFarm(prisma, farmId, {});
    // The canonical finalize engine pass. runEngines is idempotent (clears this farm's
    // PENDING engine recs and re-inserts), so a daily re-run never duplicates and never
    // clobbers a finding the farmer already resolved.
    await runEngines(prisma, farmId);
    await completeAgentRun(prisma, run.id, { status: "succeeded" });
  } catch (e) {
    // A real farm's PG&E authorization may have lapsed (MFA expiry); record it and move on.
    const note = e instanceof Error ? e.message : en.agents.refresh.failedNote;
    await completeAgentRun(prisma, run.id, { status: "failed", note });
  }
}

register({
  kind: "refresh",
  label: en.agents.refresh.label,
  trigger: "cron",
  cadence: "daily",
  run: runRefreshForFarm,
});
