// The bill-dispute agent (kind "bill_dispute", cadence "daily"). A POST-PROCESSOR: it does
// NOT run any engine. runEngines (the foundation's refresh agent) is the SOLE owner of the
// BILL_AUDIT_TOOL key and already produced the bill-audit Recommendation rows; this agent
// merely READS those rows, selects the disputable ones (detect), drafts a farmer-English
// letter (draft, the only LLM in the suite), and RECORDS a "proposed" action that waits for
// one-tap OWNER approval. Nothing is filed and no engine is re-run.
//
// IDEMPOTENT across the daily sweep: runEngines clears and re-inserts the farm's pending
// engine recs each day, so a finding's Recommendation id changes but its (pumpId, cycleStart)
// identity does not. We dedupe NEW proposals against the (pumpId, cycleStart) carried in the
// proposedCommand of existing "file_bill_dispute" actions (any non-rejected status), so a
// re-run proposes nothing new for a cycle already proposed/approved/executed. A previously
// SKIPPED (rejected) cycle is also not re-proposed — the owner already said no.
//
// RESILIENCE: the whole per-farm body runs inside try/catch; a throw closes the run "failed"
// and is swallowed so the dispatcher's sweep over the other farms continues (same shape as the
// refresh agent). Farm-scoped throughout; cron has no user session, so triggeredBy is "cron".

import type { PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { register } from "../../registry";
import { startAgentRun, recordAgentAction, completeAgentRun } from "../../run";
import { detect, disputeDedupeKey, type AuditCandidateRow, type DisputeCandidate } from "./detect";
import { draftDisputeLetter, disputeMonthLabel } from "./draft";

/** The action kind this agent records (its file_bill_dispute vocabulary, feature-defined). */
export const FILE_BILL_DISPUTE_KIND = "file_bill_dispute";

const t = en.agents.billDispute;

/** Read the dedupe key off an existing proposed action's proposedCommand. The agent writes
 *  {pumpId, cycleStart} there, so we rebuild the SAME key detect() produced; a malformed /
 *  missing command yields null (it simply will not match, so the cycle could be re-proposed
 *  — acceptable, since a malformed legacy row is rare and a duplicate proposal is a calm
 *  audit row, never a side effect). */
function dedupeKeyOfCommand(command: unknown): string | null {
  if (typeof command !== "object" || command === null || Array.isArray(command)) return null;
  const c = command as Record<string, unknown>;
  const pumpId = typeof c.pumpId === "string" ? c.pumpId : null;
  const cycleStart = typeof c.cycleStart === "string" ? c.cycleStart : null;
  if (pumpId === null || cycleStart === null) return null;
  return disputeDedupeKey(pumpId, cycleStart);
}

/**
 * Run the bill-dispute agent for one farm. Reads the farm's pending bill-audit recs, selects
 * the disputable ones, and for each NEW (not-already-proposed) cycle records a proposed
 * "file_bill_dispute" action carrying the drafted letter. Never runs an engine. Never files.
 */
export async function runBillDisputeForFarm(
  prisma: PrismaClient,
  farmId: string,
): Promise<void> {
  const run = await startAgentRun(prisma, {
    farmId,
    kind: "bill_dispute",
    triggeredBy: "cron",
  });
  try {
    // The farm's pending recommendations — farm-scoped. detect() narrows to the act-severity
    // bill-audit findings above the dispute floor; we never re-run the engine that made them.
    const rows = await prisma.recommendation.findMany({
      where: { farmId, status: "pending" },
      select: { id: true, action: true, severity: true, status: true },
    });
    const candidates = detect(rows as AuditCandidateRow[]);

    // Already-proposed (or approved/executed) cycles: dedupe on the stable (pumpId, cycleStart)
    // key carried in each prior action's proposedCommand. A rejected proposal still counts as
    // "seen" so a daily re-run does not pester the owner with a dispute they skipped.
    const priorActions = await prisma.agentAction.findMany({
      where: { farmId, kind: FILE_BILL_DISPUTE_KIND },
      select: { proposedCommand: true },
    });
    const seen = new Set<string>();
    for (const a of priorActions) {
      const key = dedupeKeyOfCommand(a.proposedCommand);
      if (key !== null) seen.add(key);
    }

    // Resolve the pump names for the candidate meters (one query, farm-scoped) so the letter
    // and summary name the meter the grower knows, never a cuid.
    const pumpIds = [...new Set(candidates.map((c) => c.pumpId))];
    const pumps =
      pumpIds.length === 0
        ? []
        : await prisma.pump.findMany({
            where: { farmId, id: { in: pumpIds } },
            select: { id: true, name: true },
          });
    const pumpNames = new Map(pumps.map((p) => [p.id, p.name]));

    for (const candidate of candidates) {
      if (seen.has(candidate.dedupeKey)) continue; // already proposed/approved/skipped
      seen.add(candidate.dedupeKey); // guard against a dup within this same sweep too

      await proposeOne(prisma, { runId: run.id, farmId, candidate, pumpNames });
    }

    await completeAgentRun(prisma, run.id, { status: "succeeded" });
  } catch (e) {
    const note = e instanceof Error ? e.message : null;
    await completeAgentRun(prisma, run.id, { status: "failed", note });
  }
}

/** Draft and record ONE proposed dispute action for a candidate. Split out so a test can
 *  exercise the proposal write directly. The letter is drafted here (offline-deterministic
 *  with no key); the proposedCommand carries the stable dedupe key facts. */
async function proposeOne(
  prisma: PrismaClient,
  args: {
    runId: string;
    farmId: string;
    candidate: DisputeCandidate;
    pumpNames: Map<string, string>;
  },
): Promise<void> {
  const { runId, farmId, candidate, pumpNames } = args;
  // A meter we could not name (it was deleted between the engine run and now) falls back to a
  // plain label so the proposal is still honest rather than dropped.
  const pumpName = pumpNames.get(candidate.pumpId) ?? candidate.pumpId;
  const month = disputeMonthLabel(candidate.cycleStart);

  const letter = await draftDisputeLetter(candidate, pumpName);

  await recordAgentAction(prisma, {
    agentRunId: runId,
    farmId,
    recommendationId: candidate.recommendationId,
    kind: FILE_BILL_DISPUTE_KIND,
    summary: t.actionSummary(pumpName, month, candidate.excessUsd),
    proposedCommand: { pumpId: candidate.pumpId, cycleStart: candidate.cycleStart },
    draftSubject: letter.subject,
    draftBody: letter.body,
  });
}

register({
  kind: "bill_dispute",
  label: t.label,
  trigger: "cron",
  cadence: "daily",
  run: runBillDisputeForFarm,
});
