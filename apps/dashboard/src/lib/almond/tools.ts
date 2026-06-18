import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
import {
  rateSchedulesByFrequency,
  resolveMeterQuery,
  summarizeFarmOverview,
  summarizeFindings,
  summarizeMeterDetail,
  summarizeMeters,
  summarizeReconciliation,
  type MeterFilters,
} from "./shape";

/**
 * The read-only, farm-scoped data Almond can read. Each executor takes the SAME `deps` (a
 * Prisma client + a single resolved farmId, from the session in the route), reuses the existing
 * dashboard loaders, and shapes the result with the pure `./shape` helpers. The model can NEVER
 * read another farm's data: the farmId lives in `deps`, never in a tool argument. Nothing here
 * mutates (Almond is read-only, mirroring the v1 "display, never execute" recommendation law).
 *
 * Executors are exported standalone (clean to unit-test against a real DB); `buildAlmondSkills`
 * is the SKILL FACTORY: it wraps each executor in an AI SDK `tool()` closed over `deps`, and
 * takes an `actor` capability flag so it can include or OMIT a skill by capability (ADR-A08).
 * Scope (`farmId`) comes only from `deps`; capability (`authedOwner`) comes only from `actor` —
 * both are resolved server-side in the route, never from the model or client. "Skill" is the
 * extensible unit every later capability is built as (navigate in 7.3; export/report in Epic 8).
 */
export type AlmondToolDeps = {
  prisma: PrismaClient;
  farmId: string;
  farmName: string;
};

/**
 * The server-resolved capability of the caller. `authedOwner` is true only for a signed-in
 * grower acting on their OWN connected farm; the public Tour (demo farm) is false. The factory
 * gates owner-only skills by OMISSION — it never hands the model a skill it must not call — so
 * capability is a structural property, not a bypassable runtime check inside a skill (ADR-A08).
 */
export type AlmondActor = {
  authedOwner: boolean;
};

export async function farmOverview(deps: AlmondToolDeps) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return summarizeFarmOverview(deps.farmName, meters, computeKpiStrip(meters));
}

export async function meterList(deps: AlmondToolDeps, filters: MeterFilters = {}) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return summarizeMeters(meters, filters);
}

export async function meterDetail(deps: AlmondToolDeps, query: string) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  const match = resolveMeterQuery(meters, query);
  if (match.kind === "found") {
    return { found: true as const, meter: summarizeMeterDetail(match.meter) };
  }
  if (match.kind === "ambiguous") {
    // Several meters match by name; ask the grower to pick rather than guess one.
    return { found: false as const, query, ambiguous: true as const, candidates: match.names };
  }
  return { found: false as const, query };
}

export async function findingList(deps: AlmondToolDeps) {
  const findings = await loadFindings(deps.prisma, deps.farmId);
  return { count: findings.length, findings: summarizeFindings(findings) };
}

export async function ratesSummary(deps: AlmondToolDeps) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return { rates: rateSchedulesByFrequency(meters) };
}

export async function reconciliation(deps: AlmondToolDeps) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return summarizeReconciliation(meters);
}

/**
 * Skills handed to the model ONLY for an authenticated farm owner (ADR-A08). Empty for now —
 * the owner-only `exportSpreadsheet` / `generateReport` skills arrive in Epic 8, where this is
 * the single place they are added (they will close over `deps` like the read tools). Returning
 * `{}` here means an owner currently gets the same set as the public Tour, which is correct:
 * navigation (7.3) is read-safe and added unconditionally, and no write skill exists yet.
 */
function ownerOnlySkills() {
  return {} as const;
}

export function buildAlmondSkills(deps: AlmondToolDeps, actor: AlmondActor) {
  const readTools = {
    getFarmOverview: tool({
      description:
        "Get a high-level overview of the whole farm: number of meters, rate schedules in use, latest month spend, demand charge, and the meter whose bill moved the most. Call this first for broad questions.",
      inputSchema: z.object({}),
      execute: () => farmOverview(deps),
    }),

    listMeters: tool({
      description:
        "List the farm's meters (pumps) with their rate, account, entity, ranch, and latest bill. Optionally filter by rate schedule, entity, or ranch (case-insensitive contains).",
      inputSchema: z.object({
        rate: z.string().optional().describe("Filter by rate schedule, e.g. AG-A1"),
        entity: z.string().optional().describe("Filter by legal billing entity name"),
        ranch: z.string().optional().describe("Filter by ranch name"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max meters to return (default 25)"),
      }),
      execute: (filters) => meterList(deps, filters),
    }),

    getMeter: tool({
      description:
        "Get one meter's detail and recent bills. Look it up by meter name, SA id, or id.",
      inputSchema: z.object({
        query: z.string().describe("The meter name, SA id, or id to look up"),
      }),
      execute: ({ query }) => meterDetail(deps, query),
    }),

    listFindings: tool({
      description:
        "List the farm's open findings (money-saving opportunities and issues), highest dollar impact first. Use this when the grower asks about savings, opportunities, or what needs attention.",
      inputSchema: z.object({}),
      execute: () => findingList(deps),
    }),

    getRatesSummary: tool({
      description:
        "Summarize the distinct rate schedules across the farm and how many meters are on each, most common first, flagging legacy rates.",
      inputSchema: z.object({}),
      execute: () => ratesSummary(deps),
    }),

    getReconciliation: tool({
      description:
        "Summarize how complete the farm's billing data is: how many meters are in each coverage state. Use this when the grower asks how much we know or whether the data is complete.",
      inputSchema: z.object({}),
      execute: () => reconciliation(deps),
    }),
  };

  // Capability seam (ADR-A08): the read tools are public-safe and handed to every actor; any
  // owner-only skill is spread in HERE only when `actor.authedOwner` is true, so the model is
  // never handed a skill it must not call. Today `ownerOnlySkills()` is empty, so the set is the
  // six read tools regardless of capability — the gate is wired, Epic 8 spends it.
  return {
    ...readTools,
    ...(actor.authedOwner ? ownerOnlySkills() : {}),
  };
}

export type AlmondSkills = ReturnType<typeof buildAlmondSkills>;
