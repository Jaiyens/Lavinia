// The agent-ledger DB edge: the only place a run or an action is written. Mirrors the
// engine runners' contract (takes an explicit PrismaClient, no UI, testable in isolation)
// and the GeneratedReport immutability rule: append-only, farmId on every write, never an
// in-place rewrite of history. An agent opens a run (startAgentRun), records what it
// proposed (recordAgentAction), then closes the run (completeAgentRun). Approval and
// execution of a recorded action live in approval.ts, never here.

import type { Prisma, PrismaClient } from "@prisma/client";
import type { AgentRunKind, AgentRunStatus } from "./types";

/** Open a run for one agent against one farm. Status starts "running"; the dispatcher (or
 *  the agent) closes it with completeAgentRun. `triggeredBy` is "cron" for the system
 *  sweep or a user id / label for a manual trigger. Farm-scoped: the run is bound to this
 *  farm and every later read is farmId-scoped. */
export async function startAgentRun(
  prisma: PrismaClient,
  input: { farmId: string; kind: AgentRunKind; triggeredBy: string },
): Promise<{ id: string }> {
  const run = await prisma.agentRun.create({
    data: {
      farmId: input.farmId,
      kind: input.kind,
      triggeredBy: input.triggeredBy,
      status: "running",
    },
    select: { id: true },
  });
  return run;
}

/** Record one thing an agent proposed under an open run. The action starts "proposed":
 *  it is an audit row AND an approval gate, and a v1 agent never acts on its own. `farmId`
 *  is required (and must be the run's farm) so the row is independently farmId-scoped for
 *  the ownership chokepoint without a join. `recommendationId` links the finding it acts
 *  on when there is one; the optional draft/command fields capture EXACTLY what an approver
 *  would execute. Append-only: a re-proposal is a new row, never an edit. */
export async function recordAgentAction(
  prisma: PrismaClient,
  input: {
    agentRunId: string;
    farmId: string;
    recommendationId?: string | null;
    kind: string;
    summary: string;
    proposedCommand?: Prisma.InputJsonValue;
    draftSubject?: string | null;
    draftBody?: string | null;
    reportId?: string | null;
  },
): Promise<{ id: string }> {
  const action = await prisma.agentAction.create({
    data: {
      agentRunId: input.agentRunId,
      farmId: input.farmId,
      recommendationId: input.recommendationId ?? null,
      kind: input.kind,
      summary: input.summary,
      status: "proposed",
      ...(input.proposedCommand !== undefined
        ? { proposedCommand: input.proposedCommand }
        : {}),
      draftSubject: input.draftSubject ?? null,
      draftBody: input.draftBody ?? null,
      reportId: input.reportId ?? null,
    },
    select: { id: true },
  });
  return action;
}

/** Close a run. Stamps the terminal status ("succeeded" | "failed") and completedAt, plus
 *  an optional note (e.g. the failure reason). Idempotent in practice: the dispatcher calls
 *  it once per run; a second call simply re-stamps the same terminal state. */
export async function completeAgentRun(
  prisma: PrismaClient,
  runId: string,
  input: { status: Exclude<AgentRunStatus, "running">; note?: string | null },
): Promise<void> {
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: input.status,
      note: input.note ?? null,
      completedAt: new Date(),
    },
  });
}
