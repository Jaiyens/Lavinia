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
import { navigateInputSchema, resolveNavigate, type NavigateInput } from "./skills/navigate";
import {
  exportSpreadsheetInputSchema,
  runExportSpreadsheet,
  type ExportSpreadsheetInput,
} from "./skills/export-spreadsheet";
import {
  generateReportInputSchema,
  runGenerateReport,
  type GenerateReportInput,
} from "./skills/generate-report";

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
 *
 * `userId` is the signed-in grower's id, carried so an owner-only side effect (Story 8.6:
 * persisting an export to Reports) can record WHO asked. It is null for the public Tour. Like
 * `authedOwner` it is a SERVER property, resolved in the route from the session, never from the
 * request body or the model.
 */
export type AlmondActor = {
  authedOwner: boolean;
  userId: string | null;
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
 * The `navigate` skill executor (Story 7.3). Loads the farm's meters (scoped by `deps`, like every
 * read tool) and delegates to the pure `resolveNavigate` resolver, which turns the request into a
 * typed `NavigateAction` over the canonical surface keys — or a clarify/none/unknown-surface result.
 * It EMITS the action as its return value; the server->client bridge that writes the `data-navigate`
 * part and applies it via `useQueryState` setters is Story 7.4. Read-only on data: setting URL state
 * mutates no Finding/rate/meter, so navigate is read-safe and handed to every actor (ADR-A08).
 */
export async function navigateSkill(deps: AlmondToolDeps, input: NavigateInput) {
  const meters = await loadMetersForFarm(deps.prisma, deps.farmId);
  return resolveNavigate(meters, input);
}

/**
 * The `exportSpreadsheet` skill executor (Story 8.5). Reads the uncapped export loader (8.1),
 * applies the requested filter, and builds the file (8.2/8.3) with the coverage footer (8.4),
 * returning a typed result. Owner-only: it is only ever wired in for an authenticated owner via
 * `ownerOnlySkills` below. Scope (farmId) is inherited from `deps`, never from the input. The
 * generated bytes ride the result; the responder lifts them onto the stream as a `data-report`
 * part (download card) and collapses the model-visible output to a small text summary.
 */
export function exportSpreadsheetSkill(deps: AlmondToolDeps, input: ExportSpreadsheetInput) {
  return runExportSpreadsheet(deps, input);
}

/**
 * The `generateReport` skill executor (Story 9.3). Reads the uncapped export loader (8.1), applies the
 * requested filter, authors each chosen section deterministically, and renders the PDF (9.2) with the
 * coverage footer (8.4), returning a typed result. Owner-only: it is only ever wired in for an
 * authenticated owner via `ownerOnlySkills` below. Scope (farmId) is inherited from `deps`, never from
 * the input. The generated bytes ride the result; the responder lifts them onto the stream as a
 * `data-report` part (download card), persists them to Reports (8.6), and collapses the model-visible
 * output to a small text summary.
 */
export function generateReportSkill(deps: AlmondToolDeps, input: GenerateReportInput) {
  return runGenerateReport(deps, input);
}

/**
 * Skills handed to the model ONLY for an authenticated farm owner (ADR-A08). The single place an
 * owner-only capability is added; gated by OMISSION in `buildAlmondSkills` (the public Tour never
 * receives these, so the model can never call them). As of Story 9.3 this is `exportSpreadsheet`
 * (Story 8.5) and `generateReport` (Story 9.3): each WRITES a file (a real capability beyond the
 * read-safe public set), so both are owner-only.
 *
 * `toModelOutput` collapses each tool's result for the MODEL's context to a tiny text summary, so the
 * file bytes never enter the prompt window (they are lifted onto the UI stream by the responder
 * instead). The full result, including the bytes, is still available to the responder via
 * `onStepFinish`'s tool results - that is where the download card is written and the file persisted.
 */
function ownerOnlySkills(deps: AlmondToolDeps) {
  return {
    exportSpreadsheet: tool({
      description:
        "Make a spreadsheet of the grower's farm and hand it to them as a download. Choose table: \"meters\" for the full meter inventory (rate, account, latest bill, coverage), or \"billDue\" for each meter's billing-cycle closing date. Optionally narrow to one rate, entity, or ranch. Use this when the grower asks to export, download, or get a spreadsheet of their meters or bill dates. Every meter in scope is included; you do not pick values or columns, only the shape.",
      inputSchema: exportSpreadsheetInputSchema,
      execute: (input) => exportSpreadsheetSkill(deps, input),
      // Keep the spreadsheet bytes OUT of the model's context: the model only needs to know whether
      // the file was made (and the one-line preview), not its contents. The bytes reach the grower
      // via the responder's `data-report` part, not the prompt window.
      toModelOutput: ({ output }) => {
        if (output.kind === "file") {
          return { type: "text", value: `Made ${output.fileName} with ${output.meterCount} meters.` };
        }
        return { type: "text", value: output.message };
      },
    }),
    generateReport: tool({
      description:
        'Make a PDF report of the grower\'s farm and hand it to them as a download (also saved to their Reports). Choose which sections to include and in what order: "summary" (the farm at a glance), "meterTable" (every meter listed), "misRated" (meters that may be on the wrong rate), "savings" (estimated dollars from rate changes), "singleMeter" (one meter\'s detail; also pass the meter name). Optionally narrow to one rate, entity, or ranch. Use this when the grower asks for a PDF, a report, a summary document, or a printout. Omit the sections to get a farm summary plus the meter table. You pick only the shape; every value is authored from the farm data.',
      inputSchema: generateReportInputSchema,
      execute: (input) => generateReportSkill(deps, input),
      // Keep the PDF bytes OUT of the model's context: the model only needs to know whether the file
      // was made (and the one-line preview), not its contents. The bytes reach the grower via the
      // responder's `data-report` part, not the prompt window.
      toModelOutput: ({ output }) => {
        if (output.kind === "file") {
          return { type: "text", value: `Made ${output.fileName} covering ${output.meterCount} meters.` };
        }
        return { type: "text", value: output.message };
      },
    }),
  } as const;
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

    navigate: tool({
      description:
        "Drive the dashboard for the grower: open a specific meter, switch the lens (chart, table, map, or calendar), or filter the table by entity, ranch, or rate. Use this when the grower asks to see, open, show, or filter something. To open a meter, pass open: \"meter\" with a query (its name, SA id, or id). If the request matches more than one meter, this returns the candidates so you can ask which one; it never guesses, and it never navigates to a surface that does not exist.",
      inputSchema: navigateInputSchema,
      execute: (input) => navigateSkill(deps, input),
    }),
  };

  // Capability seam (ADR-A08): the read tools above (including `navigate`) are public-safe and handed
  // to every actor — `navigate` only sets URL state, so it is read-safe and added UNCONDITIONALLY.
  // Any owner-only skill is spread in HERE only when `actor.authedOwner` is true, so the model is
  // never handed a skill it must not call. As of Story 8.5 `ownerOnlySkills()` carries
  // `exportSpreadsheet` (it WRITES a file), so an owner gets the read set + navigate + export, while
  // the public Tour gets only the read-safe set — the export skill is withheld by OMISSION.
  return {
    ...readTools,
    ...(actor.authedOwner ? ownerOnlySkills(deps) : {}),
  };
}

export type AlmondSkills = ReturnType<typeof buildAlmondSkills>;
