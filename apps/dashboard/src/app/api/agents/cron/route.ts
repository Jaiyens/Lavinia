// The single agent dispatcher. Vercel Cron hits this on a schedule (vercel.json); it sweeps
// the non-demo farms and runs each registered cron agent for the farms it applies to. It is
// SYSTEM-INITIATED: there is no user session, so writes are farmId-scoped by the iterated
// farm and never gated by a per-request role/ownership check (the agents themselves only
// ever write rows scoped to the farm they were handed).
//
// Fail-closed auth: the request must carry `Authorization: Bearer ${CRON_SECRET}`. Without
// the env var set, OR without a matching header, it is a 401 — so an absent CRON_SECRET
// keeps the route inert (offline-green: nothing runs, nothing is called).
//
// Resilience: per (farm, agent) work is wrapped in try/catch so one farm's failure (e.g.
// PG&E MFA expired its authorization) never aborts the sweep over the rest.

import { prisma } from "@/lib/db";
import { listAgents, type AgentDefinition } from "@/lib/agents/registry";
// Importing the barrel registers every agent (side-effect imports). Must run before
// listAgents() so the registry is populated.
import "@/lib/agents/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cadence windows, in milliseconds. A "daily" agent is skipped for a farm if a run of that
// kind COMPLETED within ~20h (slack under 24h so a slightly-early cron tick still runs it);
// "monthly" within ~28d (slack under a calendar month).
const DAILY_WINDOW_MS = 20 * 60 * 60 * 1000;
const MONTHLY_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

/** The cadence window for an agent's cadence. Exported for the focused selection test. */
export function cadenceWindowMs(cadence: AgentDefinition["cadence"]): number {
  return cadence === "daily" ? DAILY_WINDOW_MS : MONTHLY_WINDOW_MS;
}

/**
 * Whether enough time has passed since the most-recent COMPLETED run of this kind for this
 * farm to run the agent again. A completed run is one with a `completedAt` inside the
 * cadence window; if none exists in the window, the agent is due. Pure given `lastRunAt`
 * (the most recent completedAt for this farm+kind, or null), so it is unit-testable.
 */
export function isDueForRun(
  lastCompletedAt: Date | null,
  cadence: AgentDefinition["cadence"],
  now: Date,
): boolean {
  if (lastCompletedAt === null) return true;
  return now.getTime() - lastCompletedAt.getTime() >= cadenceWindowMs(cadence);
}

/** Fail-closed bearer check. Requires CRON_SECRET set AND a matching Authorization header. */
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // unset -> inert (offline-green)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * The farms a given agent applies to. The "refresh" agent requires a DURABLE re-pullable
 * PG&E authorization: a Connection with type "pge_smd" AND source "smd" AND a non-null
 * externalRef (the live form uid we re-pull against). We deliberately do NOT filter on
 * Connection.status === "active": a real authorized farm sits at status "pending" until the
 * grower hits the confirm step, and a cron refresh must still run for it. Every other
 * (future) agent runs for ANY non-demo farm. Always farmId-only selection, never another
 * dimension.
 */
async function farmsForAgent(kind: AgentDefinition["kind"]): Promise<{ id: string }[]> {
  if (kind === "refresh") {
    return prisma.farm.findMany({
      where: {
        isDemo: false,
        connections: {
          some: { type: "pge_smd", source: "smd", externalRef: { not: null } },
        },
      },
      select: { id: true },
    });
  }
  // Post-processor agents (the future feature agents) run for any non-demo farm.
  return prisma.farm.findMany({ where: { isDemo: false }, select: { id: true } });
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const agents = listAgents().filter((a) => a.trigger === "cron");

  let ran = 0;
  let skipped = 0;
  let failed = 0;

  for (const agent of agents) {
    const farms = await farmsForAgent(agent.kind);
    for (const farm of farms) {
      // CADENCE SKIP: find the most-recent COMPLETED run of this kind for this farm; skip
      // when it landed inside the cadence window (the @@index([farmId, kind, status])
      // backs this query).
      const last = await prisma.agentRun.findFirst({
        where: { farmId: farm.id, kind: agent.kind, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      });
      if (!isDueForRun(last?.completedAt ?? null, agent.cadence, now)) {
        skipped += 1;
        continue;
      }
      // Per (farm, agent) isolation: one failure never aborts the sweep. The agent's own
      // run.ts records a "failed" AgentRun; this catch is the last line of defense for an
      // error thrown OUTSIDE the agent's own try (so the loop always continues).
      try {
        await agent.run(prisma, farm.id);
        ran += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return Response.json({ ok: true, ran, skipped, failed, agents: agents.length });
}
