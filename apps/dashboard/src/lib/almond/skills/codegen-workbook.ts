import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { en } from "@/copy/en";
import {
  createGatewayModel,
  CODEGEN_MAX_OUTPUT_TOKENS,
  codegenThinkingProviderOptions,
} from "@/lib/ai/gateway";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import { loadExportData } from "@/lib/almond/export/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { buildFullWorkbook } from "@/lib/almond/export/full-workbook";
import { buildReportSnapshot, type ReportSnapshot } from "@/lib/almond/codegen/snapshot";
import { renderXlsx, CodegenRuntimeUnavailableError } from "@/lib/almond/codegen/run";
import { extractXlsxNumbers, verifyWorkbookArtifact } from "@/lib/almond/codegen/verify";
import { billableTokens, recordUsage } from "@/lib/almond/usage-budget";

/**
 * The `codegenWorkbook` skill — the DEFAULT spreadsheet path. Almond builds the grower's Excel workbook
 * by WRITING a complete openpyxl python script over the farm snapshot, which a runtime (Vercel Sandbox in
 * prod, a local subprocess in dev) executes to produce the .xlsx. The model has FULL styling freedom —
 * any color, font, border, merge, column width, freeze, conditional format, or native chart the grower
 * asks for — so "make the savings column gold and bold" is just code, not a capability we have to
 * pre-build. Every workbook is generated FROM SCRATCH each turn (no cache, no fixed template).
 *
 * NUMBER HONESTY (the one guard, fail-closed but fix-and-retry): the model declares every figure in a
 * manifest — a LITERAL entry tied to a snapshot path, or a DERIVED entry the VERIFIER recomputes
 * (sum/count). After each render the produced .xlsx is reopened in our trusted process and every cell
 * number is scanned against the snapshot-derived (+ verified-derived) allowlist. A mismatch is fed BACK
 * to the model (the offending number, named) so it repairs and re-renders within the step budget — it is
 * never silently swapped for a generic template. Only a genuinely UNAVAILABLE runtime (offline/CI/outage)
 * falls back to the deterministic builder; a model/verify failure with the runtime up is an honest error.
 */

/** The codegen model: Sonnet 4.6 (writing the openpyxl script is a Sonnet task; the gateway alias matches
 *  the picker allowlist in src/lib/almond/models.ts). */
const CODEGEN_MODEL = "anthropic/claude-sonnet-4.6";

/** The default ask when the grower did not phrase a specific one (e.g. tapped a generic "export" action).
 *  Exported so the enqueue path (tools.ts) stamps the SAME ask onto the job's requestText that the runner
 *  would otherwise default to, keeping the persisted request and the build prompt identical. */
export const HARDCODED_ASK =
  "Build a clean, professional Excel workbook of the farm: a Summary tab (the farm at a glance) and a Rate savings tab (meter, current rate, suggested rate, estimated annual savings) ending in a bold total. Use only the data in the snapshot.";

/** Max steps for the codegen loop (write script -> render -> see error/verify-fail -> fix -> render).
 *  Higher than the old declarative path's 4 so the model has room to REPAIR a number the verifier flags. */
const CODEGEN_MAX_STEPS = 6;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The skill's input: the grower's request, in their words. The model writes the workbook to match it. */
export const codegenWorkbookInputSchema = z.object({
  request: z
    .string()
    .optional()
    .describe(
      "The grower's spreadsheet request in their own words, including any styling (colors, fonts, layout, which columns/tabs). Used as the build prompt and kept for the Reports history.",
    ),
});

export type CodegenWorkbookInput = z.infer<typeof codegenWorkbookInputSchema>;

/** The outcome the skill returns to the responder. Mirrors the file-skill shape so the responder's
 *  persist-and-stream path serves it unchanged. */
export type CodegenWorkbookResult =
  | {
      kind: "file";
      preview: string;
      fileName: string;
      contentType: string;
      bytes: Uint8Array;
      meterCount: number;
      coverageAsOf: string | null;
      params: Prisma.InputJsonValue;
      /** True when these bytes are the DETERMINISTIC fallback (runtime unavailable), so the responder
       *  still streams a real file. */
      fromFallback?: boolean;
    }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

/** A filesystem-safe slug for the farm name (no path, no separators). */
function slug(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "farm" : cleaned;
}

/** The server-authored download file name for a codegen workbook. */
function workbookFileName(farmName: string): string {
  return `${slug(farmName)}-workbook.xlsx`;
}

/** Truncate model-visible text (runtime stderr) so a stack trace never bloats the prompt window. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** The figure manifest the model declares (literal snapshot value, or a verifier-recomputed sum/count).
 *  Stays permissive but typed enough to steer the model; verify.ts re-validates everything fail-closed. */
const manifestSchema = z.array(
  z.union([
    z.object({
      kind: z.literal("literal").optional(),
      label: z.string(),
      value: z.number().describe("The figure in integer CENTS, exactly as in the snapshot."),
      sourcePath: z.string().describe('Path into the snapshot, e.g. "opportunities[0].savingsCents".'),
    }),
    z.object({
      kind: z.literal("derived"),
      label: z.string(),
      value: z.number().describe("The recomputed figure: integer CENTS for sum, a plain integer for count."),
      op: z.enum(["sum", "count"]),
      sourcePaths: z
        .array(z.string())
        .min(1)
        .describe("Snapshot paths the verifier sums (cents) or whose array length it counts."),
    }),
  ]),
);

/**
 * A short description of every `ComprehensiveSnapshotMeter` field + that `null` means NOT ON FILE, so the
 * model knows the per-meter shape WITHOUT the full 222-meter array bloating the prompt (it iterates the
 * full `meters` array at runtime from snapshot.json). Kept terse, plain operator English.
 */
const METER_FIELDS_GUIDE = [
  "id, name — the meter's id and pump name.",
  "serviceId — PG&E SA id (null = not on file).",
  "accountNumber — PG&E account number (null = not on file).",
  "entityName — the legal billing entity's name (null = not on file).",
  "entityBillingName — how PG&E prints that entity (null = not on file).",
  "ranchName, cropName — the ranch and crop (null = not on file).",
  "blocks — [{name, acreage}] the fields this pump serves; acreage null = not on file; [] = none on file.",
  "rateSchedule — the rate code, e.g. AG-C (null = not on file).",
  "isLegacy — true when the rate is a legacy schedule.",
  "serialCode — the bill serial letter (null = not on file).",
  "status — pump health verbatim, e.g. GOOD / BAD (null = not on file).",
  "powerSource — electric / diesel / gas (null = not on file).",
  "gpm, latitude, longitude — pump flow + location (null = not on file).",
  "coverageState — no_bill / needs_review / reconciled.",
  "costSource — BILLED (a real posted bill), MODELED (an ESTIMATE from usage), REVIEW, or NONE.",
  "modeledMonthlyCents — modeled monthly estimate, INTEGER CENTS; null unless costSource is MODELED.",
  "latestBilledCents — latest posted bill, INTEGER CENTS; null unless costSource is BILLED (an unreconciled meter is null, never 0).",
  "latestDemandCents, latestPeakKw, latestCycleClose — the freshest cycle's demand (cents), peak kW, and close date (null = not on file).",
  "recentBills — up to 3 cycles [{start, close, printedTotalCents, demandCents, totalKwh, peakKw, tariff, energyCents, nbcCents}], money in INTEGER CENTS (a value is null when not on file; energyCents/nbcCents are sums, 0 when none).",
  "solar — {isSolar, nemType, solarKw, trueUpMonth, trueUpAmountCents (cents), trueUpDate, benefitingArrays[{name, nameplateKw, nemType, trueUpMonth, interconnectionDate, grandfather}], nemPeriods[{start, close, netKwh, amountCents}], sharePct (0..1), demandOwedCents (cents), uncoveredShare (0..1), grandfather}. isSolar=false means this is not a solar meter; a NEM true-up CREDIT dollar is never on file here.",
].join("\n  - ");

/**
 * The DIGEST handed to the model in the prompt (NOT the full meters[]). The runtime still gets the WHOLE
 * snapshot as snapshot.json (renderXlsx writes it verbatim — unchanged), so the model iterates every meter
 * at runtime; the prompt only needs the farm rollups + a couple of sample meter records to know the shape.
 * This keeps prompt latency sane on a 222-meter farm.
 */
export function buildWorkbookPromptDigest(snapshot: ReportSnapshot): Record<string, unknown> {
  return {
    farm: snapshot.farm,
    meterCount: snapshot.meterCount,
    coverageAsOf: snapshot.coverageAsOf,
    coverage: {
      reconciled: snapshot.totals.reconciledCount,
      needsReview: snapshot.totals.needsReviewCount,
      noBill: snapshot.totals.noBillCount,
    },
    totals: snapshot.totals,
    fleetSummary: snapshot.fleetSummary,
    entities: snapshot.entities,
    findings: snapshot.findings,
    opportunities: snapshot.opportunities,
    // Full records for the first few meters so the model sees the exact shape it will iterate.
    sampleMeters: snapshot.meters.slice(0, 3),
  };
}

/** The codegen system prompt: the openpyxl contract, full styling freedom, the number-honesty + honest
 *  "Not on file" laws, the per-meter field guide, and the DIGEST (the full meters[] rides in snapshot.json). */
function buildCodegenWorkbookSystemPrompt(snapshot: ReportSnapshot): string {
  return [
    "You build the grower's Excel workbook by WRITING a complete, self-contained Python 3 script that uses",
    "openpyxl. Then you call the renderWorkbook tool with that script (as `code`). Your script MUST:",
    '  - `import json` and load the data with `data = json.load(open("snapshot.json"))`,',
    "  - build a Workbook with openpyxl, and",
    '  - save it with `wb.save("out.xlsx")` (exactly that file name, in the current directory).',
    "",
    "THE DATA. snapshot.json contains the FULL farm: a `meters` array with EVERY meter on the farm (the",
    "digest below shows only the rollups plus the first few meters as `sampleMeters` so you can see the",
    'shape). For per-meter tables, ITERATE `data["meters"]` at runtime — do not rely on the sample alone.',
    "Each meter record has these fields (null ALWAYS means NOT ON FILE):",
    `  - ${METER_FIELDS_GUIDE}`,
    "",
    "STYLING — YOU HAVE FULL FREEDOM. Use any openpyxl capability the grower asks for: cell fills and font",
    "colors (PatternFill / Font), bold/size/italic, borders, alignment, merged cells, column widths, frozen",
    "panes, auto-filters, number formats, conditional formatting, and native charts. If the grower asks for",
    "a specific color, font, layout, set of columns, or tabs, do exactly that. There is no fixed template.",
    "",
    "NUMBERS — THE ONE HARD RULE. Every NUMBER you write into a cell MUST come from the snapshot: either a",
    "LITERAL snapshot value, or a value your script DERIVES by summing or counting snapshot values. Never",
    "invent, estimate, or round a number that is not provable from the snapshot. Money in the snapshot is",
    "INTEGER CENTS; to show dollars, divide by 100 in your script and write the resulting number with a",
    "currency number_format (do not hand-format a money string).",
    "",
    "HONESTY — NULL MEANS NOT ON FILE. Any field may be null, which means NOT ON FILE. When a value is null,",
    'render the cell as "Not on file" (or leave it blank with that note) — never invent a number, name, or',
    "label to fill it. If the grower asks for a column or field we do not have at all, still include the",
    'column but fill it "Not on file", and in your reply name which fields you could not fill. Explanations,',
    "advice, headings, and formatting are free reasoning — only a FARM NUMBER must come from the snapshot",
    "and is never invented.",
    "",
    "DO NOT WRITE LIVE SPREADSHEET FORMULAS. Do not put any `=...` formula in a cell. Compute every total or",
    "subtotal in your python and write the resulting NUMBER. (The verifier reads cell values; a live formula",
    "has no readable value and will be rejected.)",
    "",
    "MANIFEST — USUALLY EMPTY. Every number you copy straight from the snapshot is checked and allowed",
    "automatically, so most workbooks need NO manifest at all. The snapshot ALREADY gives you the totals you",
    "are likely to want: meterCount, totals.reconciledCount, totals.needsReviewCount, totals.noBillCount,",
    "and totals.rateSwitchSavingsCents — write THOSE values directly; do not recompute a count yourself.",
    "Only pass a manifest entry for a NEW total you compute that is not already in the snapshot, as",
    '{ kind: "derived", label, value, op, sourcePaths }: op "sum" sums the CENTS at every sourcePath, op',
    '"count" is the length of the array at sourcePaths[0]; the verifier recomputes it. Any number you print',
    "that is not a snapshot value (or a correct declared derived total) is rejected and named; fix it and",
    "call renderWorkbook again.",
    "",
    "DIGEST (the farm rollups + sample meter records; the FULL meters array is in snapshot.json):",
    JSON.stringify(buildWorkbookPromptDigest(snapshot), null, 2),
  ].join("\n");
}

/** What one verified render captured (held in a closure the render tool writes). */
type RenderCapture = { xlsxBytes: Buffer; manifest: unknown };

/**
 * The deterministic fallback: the styled multi-tab workbook from the SAME grounded loaders the export
 * path uses. Served ONLY when the code runtime is unavailable (offline/CI/outage), so the grower still
 * gets a real, polished workbook rather than nothing.
 */
async function fallbackToWorkbook(deps: AlmondToolDeps): Promise<CodegenWorkbookResult> {
  try {
    const data = await loadExportData(deps);
    const findings = await loadFindings(deps.prisma, deps.farmId);
    const bytes = await buildFullWorkbook(data, findings);
    return {
      kind: "file",
      preview: "Here is your farm workbook.",
      fileName: workbookFileName(deps.farmName),
      contentType: XLSX_CONTENT_TYPE,
      bytes,
      meterCount: data.meters.length,
      coverageAsOf: data.state.asOf,
      params: { ask: HARDCODED_ASK },
      fromFallback: true,
    };
  } catch {
    return { kind: "error", message: en.shell.almond.export.skill.error };
  }
}

/**
 * Run the workbook codegen. Builds the snapshot, runs the model loop (write openpyxl script -> render ->
 * verify the produced .xlsx fail-closed -> on a number mismatch feed it back to repair), and returns the
 * verified file. A genuinely unavailable runtime falls back to the deterministic workbook; a model/verify
 * failure with the runtime UP is an honest error (never a silent template swap). Scope is inherited from
 * `deps`; `signal` is threaded into the model loop and the runtime so a closed tab does not leak work.
 */
export async function runCodegenWorkbook(
  deps: AlmondToolDeps,
  input: CodegenWorkbookInput,
  signal?: AbortSignal,
): Promise<CodegenWorkbookResult> {
  try {
    const snapshot = await buildReportSnapshot(deps);
    // Nothing to ground a workbook on -> the deterministic workbook (which lists every meter) is the
    // honest answer.
    if (snapshot.opportunities.length === 0 && snapshot.meters.length === 0) {
      return await fallbackToWorkbook(deps);
    }

    const captured: { render: RenderCapture | null; runtimeDown: boolean } = {
      render: null,
      runtimeDown: false,
    };

    const renderWorkbook = tool({
      description:
        "Render the workbook to .xlsx by running your openpyxl python. Pass the complete script as `code`. The `manifest` is OPTIONAL: include it only to declare a derived total you computed (sum/count) that is not already a snapshot value. Returns whether the workbook built AND verified; if not, fix the code and call again.",
      inputSchema: z.object({
        code: z
          .string()
          .describe('The complete openpyxl python script: load snapshot.json, build the workbook, wb.save("out.xlsx").'),
        manifest: manifestSchema
          .optional()
          .describe("Optional. Only the DERIVED totals (sum/count) you computed; omit when every number is copied from the snapshot."),
      }),
      execute: async ({ code, manifest }) => {
        let out: { xlsxBytes: Buffer | null; stdout: string; stderr: string; exitCode: number };
        try {
          out = await renderXlsx({ snapshot, code, signal });
        } catch (e) {
          // The RUNTIME is unavailable / failed to boot — not a fixable code error. Record it so the loop
          // ends in the deterministic fallback rather than asking the model to repair something it cannot.
          captured.runtimeDown = true;
          if (e instanceof CodegenRuntimeUnavailableError) {
            return { ok: false as const, error: "the render runtime is unavailable" };
          }
          return { ok: false as const, error: "the render runtime failed to start" };
        }

        if (out.exitCode !== 0 || out.xlsxBytes === null) {
          // A python error in the model's script: surface stderr so the model can fix the code.
          return { ok: false as const, error: truncate(out.stderr || out.stdout || "render produced no workbook", 800) };
        }

        // Verify the produced .xlsx fail-closed. A null extraction (formula/opaque cell, oversized file)
        // or a number mismatch is fed back so the model repairs — it is NOT a silent fallback.
        const cellText = await extractXlsxNumbers(out.xlsxBytes);
        if (cellText === null) {
          return {
            ok: false as const,
            error:
              "the workbook could not be number-checked (it may contain a live formula or an unreadable cell). Write every total as a plain computed number, not a spreadsheet formula, then call renderWorkbook again.",
          };
        }
        const verdict = verifyWorkbookArtifact(snapshot, manifest, cellText);
        if (!verdict.ok) {
          return {
            ok: false as const,
            error: `a number could not be verified against the farm data (${verdict.reason}). Every printed number must come from the snapshot (a literal value or a declared sum/count). Fix it and call renderWorkbook again.`,
          };
        }

        captured.render = { xlsxBytes: out.xlsxBytes, manifest };
        return { ok: true as const };
      },
    });

    const gen = await generateText({
      model: createGatewayModel(CODEGEN_MODEL),
      system: buildCodegenWorkbookSystemPrompt(snapshot),
      prompt: input.request?.trim() || HARDCODED_ASK,
      tools: { renderWorkbook },
      stopWhen: stepCountIs(CODEGEN_MAX_STEPS),
      // Extended thinking (quality only, not streamed): the budget (8000) stays < maxOutputTokens (32000)
      // and temperature is unset, as Anthropic requires. The provider options are routed through the
      // Gateway under the "anthropic" slug; flip CODEGEN_THINKING.enabled to disable in one place.
      maxOutputTokens: CODEGEN_MAX_OUTPUT_TOKENS,
      providerOptions: codegenThinkingProviderOptions(),
      abortSignal: signal,
    });

    // Account this codegen model spend against the per-user token budget (Story 10.4). Best-effort.
    if (deps.meterUserId !== null) {
      await recordUsage(deps.prisma, {
        userId: deps.meterUserId,
        farmId: deps.farmId,
        source: "codegen",
        model: CODEGEN_MODEL,
        ...billableTokens(gen.totalUsage),
      });
    }

    if (captured.render !== null) {
      return {
        kind: "file",
        preview: "Here is your custom Excel workbook.",
        fileName: workbookFileName(deps.farmName),
        contentType: XLSX_CONTENT_TYPE,
        bytes: captured.render.xlsxBytes,
        meterCount: snapshot.meterCount,
        coverageAsOf: snapshot.coverageAsOf,
        params: { ask: input.request?.trim() || HARDCODED_ASK },
      };
    }

    // No verified file. If the RUNTIME was down, serve the deterministic workbook (the grower still gets a
    // file). Otherwise the model could not produce a verifiable workbook with the runtime UP -> honest error.
    if (captured.runtimeDown) return await fallbackToWorkbook(deps);
    return { kind: "error", message: en.shell.almond.export.skill.error };
  } catch {
    // Snapshot read / unexpected failure: the deterministic fallback (also reads the farm) is the safe
    // last resort; if it too fails it returns a typed error, never a throw to the responder.
    return await fallbackToWorkbook(deps);
  }
}
