import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { en } from "@/copy/en";
import { createGatewayModel } from "@/lib/ai/gateway";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import { loadExportData } from "@/lib/almond/export/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { buildFullWorkbook } from "@/lib/almond/export/full-workbook";
import { buildReportSnapshot, type ReportSnapshot } from "@/lib/almond/codegen/snapshot";
import { runRenderXlsxInSandbox } from "@/lib/almond/codegen/sandbox-run-xlsx";
import { extractXlsxNumbers, verifyWorkbookArtifact } from "@/lib/almond/codegen/verify";

/**
 * The `codegenWorkbook` skill (Phase 3) — the xlsx twin of `codegenExport`. Almond builds a BESPOKE
 * multi-tab Excel workbook by WRITING a DECLARATIVE workbook spec (data + style tokens, never code),
 * which a Vercel Sandbox renders with openpyxl, while a fail-closed guard guarantees every printed
 * number traces to the canonical snapshot. This is the long-tail escape hatch: the deterministic
 * `exportSpreadsheet` (the styled multi-tab workbook) serves common asks INSTANTLY; this is reserved
 * for a novel shape the templates cannot express, and is owner-only, flag-gated, throttled, and
 * creds-gated (the factory hands it to the model only when the flag + gateway key + sandbox creds + a
 * built snapshot id are all present — see codegen/flags.ts).
 *
 * Number honesty (inherited from the PDF codegen + generalized): the model declares every figure in a
 * manifest — a LITERAL entry tied to a snapshot path, or a DERIVED entry the VERIFIER recomputes
 * (sum/count). The produced .xlsx is reopened in-process and every cell number is scanned against the
 * snapshot-derived (+ verified-derived) allowlist. On ANY failure — no opportunities, model error,
 * sandbox error, verification reject, any throw — it FALLS BACK to the deterministic Phase 1 workbook
 * (`buildFullWorkbook`), so the grower never gets a broken/empty file or a fabricated number.
 */

/** The codegen model: Sonnet 4.6 (markup/data generation is a Sonnet task). Matches the picker
 *  allowlist (src/lib/almond/models.ts) and the PDF codegen path. */
const CODEGEN_MODEL = "anthropic/claude-sonnet-4.6";

/** The default ask when the grower did not phrase a specific one. */
const HARDCODED_ASK =
  "Build a clean, multi-tab Excel workbook for the farm: a Summary tab (the farm at a glance) and a Rate savings tab (meter, current rate, suggested rate, estimated annual savings) ending in a bold total, plus a bar chart of the per-opportunity savings. Use only the data in the snapshot.";

/** Max steps for the nested codegen loop (write workbook.json -> render -> see error -> fix -> render). */
const CODEGEN_MAX_STEPS = 4;

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The skill's input: SHAPE ONLY. An optional free-text `request` is the grower's bespoke ask (used as
 *  the prompt and recorded for the Reports history). No farmId, no values. */
export const codegenWorkbookInputSchema = z.object({
  request: z
    .string()
    .optional()
    .describe("The grower's custom workbook request, used to shape the workbook and kept for the Reports history."),
});

export type CodegenWorkbookInput = z.infer<typeof codegenWorkbookInputSchema>;

/** The outcome the skill returns to the responder. Mirrors `CodegenExportResult` EXACTLY so the
 *  responder's persist-and-stream path and the Phase 2 cache serve it unchanged. */
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
      cacheKey?: string;
      fromCache?: boolean;
      /** True when these bytes are the DETERMINISTIC fallback (not the verified bespoke render), so the
       *  skill wrapper does NOT cache them under the bespoke key (a one-off sandbox outage must not pin
       *  the generic workbook for 30 days). */
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

/** Truncate model-visible text (sandbox stderr) so a stack trace never bloats the prompt window. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** The declarative workbook spec the model emits (the Phase 1 WorkbookSpec shape WITH values). The
 *  shim re-validates everything, so this stays permissive but typed enough to steer the model. */
const cellSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  format: z.enum(["text", "label", "currency", "integer"]).optional(),
});
const chartSchema = z.object({
  type: z.enum(["bar", "line"]),
  title: z.string(),
  dataMinCol: z.number(),
  dataMaxCol: z.number(),
  dataMinRow: z.number(),
  dataMaxRow: z.number(),
  catMinCol: z.number(),
  catMaxCol: z.number(),
  catMinRow: z.number(),
  catMaxRow: z.number(),
  anchor: z.string(),
});
const sheetSchema = z.object({
  name: z.string(),
  title: z.string(),
  columns: z.array(z.object({ header: z.string(), width: z.number().optional() })).min(1),
  rows: z.array(z.array(cellSchema)),
  footer: z.array(z.string()),
  totals: z.array(cellSchema).optional(),
  freezeHeader: z.boolean().optional(),
  autoFilter: z.boolean().optional(),
  zebra: z.boolean().optional(),
  charts: z.array(chartSchema).optional(),
});
const workbookJsonSchema = z.object({ sheets: z.array(sheetSchema).min(1) });
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
      sourcePaths: z.array(z.string()).min(1).describe("Snapshot paths the verifier sums (cents) or whose array length it counts."),
    }),
  ]),
);

/** The codegen system prompt: the workbook contract, the number-honesty laws, and the snapshot. */
function buildCodegenWorkbookSystemPrompt(snapshot: ReportSnapshot): string {
  return [
    "You build a single Excel workbook by emitting a DECLARATIVE workbook spec (workbook.json) as DATA",
    "only — sheets, columns, typed cells, optional totals and charts. You do NOT write any executable",
    "code. Then you call the renderWorkbook tool with that spec and a manifest of every figure.",
    "",
    "CELL RULES:",
    "- A money cell uses format \"currency\" and carries the value in DOLLARS (cents / 100), e.g. 61417.76.",
    "  Do NOT pre-format it as a string; Excel renders the $ and decimals from the number.",
    "- A count/whole-number cell uses format \"integer\" and carries the raw integer.",
    "- A heading/word cell uses format \"text\"; a muted note uses \"label\"; an empty cell is value null",
    "  (never 0).",
    "",
    "ABSOLUTE RULE ON NUMBERS: every number you print MUST come from the SNAPSHOT below — either a",
    "LITERAL snapshot value, or a value you DERIVE only via the manifest. Never invent, estimate, or",
    "round a number that is not provable from the snapshot.",
    "",
    "MANIFEST: when you call renderWorkbook, pass a manifest listing EVERY figure you printed:",
    "- LITERAL: { label, value, sourcePath } where value is the figure in integer CENTS and sourcePath is",
    "  its snapshot path, e.g. \"opportunities[0].savingsCents\" or \"totals.rateSwitchSavingsCents\".",
    "- DERIVED (for a total or count you compute): { kind: \"derived\", label, value, op, sourcePaths }.",
    "  op \"sum\" sums the CENTS at every sourcePath (value = that sum in cents); op \"count\" is the length",
    "  of the array at sourcePaths[0]. The verifier recomputes it; a wrong value is rejected.",
    "If a number has no manifest entry, or your value does not match, the workbook is rejected.",
    "",
    "CHARTS: you MAY add a native chart to a sheet (type bar|line, a title, 1-based data/category cell",
    "coords, and an anchor like \"H2\"). Point a chart ONLY at cells that already appear in a data row.",
    "",
    "SNAPSHOT (the only source of truth):",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");
}

/** What one render attempt captured (held in a closure the render tool writes). */
type RenderCapture = { xlsxBytes: Buffer; manifest: unknown };

/**
 * The deterministic fallback: the Phase 1 styled multi-tab workbook, built from the SAME grounded
 * loaders the exportSpreadsheet skill uses, so the fallback can never disagree with the screen. Used
 * whenever the codegen path cannot SAFELY produce a verified file, so the grower always gets a real,
 * polished workbook. `ExportLoadDeps` (prisma+farmId+farmName) is a subset of `AlmondToolDeps`.
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
      // Mark as the fallback so the skill wrapper never caches it under the bespoke key.
      fromFallback: true,
    };
  } catch {
    // The fallback itself failed (a transient DB error / corrupt fixture). Return a TYPED error rather
    // than throwing out of the skill — a thrown tool.execute becomes a tool-error with no card and no
    // fallback. Mirrors the PDF twin's runGenerateReport contract (never throws to the responder).
    return { kind: "error", message: en.shell.almond.export.skill.error };
  }
}

/**
 * Run the workbook codegen. Builds the snapshot, runs the nested model loop (the model writes the
 * declarative spec and calls renderWorkbook, which executes openpyxl in a Vercel Sandbox), then
 * verifies the rendered .xlsx fail-closed. Falls back to the deterministic workbook on every
 * non-success. Scope is inherited from `deps`; `signal` is threaded into the model loop and the sandbox
 * so a closed tab does not leak a running microVM.
 */
export async function runCodegenWorkbook(
  deps: AlmondToolDeps,
  input: CodegenWorkbookInput,
  signal?: AbortSignal,
): Promise<CodegenWorkbookResult> {
  try {
    const snapshot = await buildReportSnapshot(deps);
    // Nothing to ground a bespoke workbook on -> the deterministic workbook (which lists every meter)
    // is the honest answer.
    if (snapshot.opportunities.length === 0 && snapshot.meters.length === 0) {
      return await fallbackToWorkbook(deps);
    }

    const captured: { render: RenderCapture | null } = { render: null };

    const renderWorkbook = tool({
      description:
        "Render the workbook to .xlsx. Pass the complete declarative workbook spec (sheets, typed cells, optional totals and charts) and a manifest of every figure you printed (each with its snapshot sourcePath, or a derived op). Returns whether the workbook built; if not, fix the spec and call again.",
      inputSchema: z.object({
        workbookJson: workbookJsonSchema.describe("The declarative workbook: sheets of typed cells, with values."),
        manifest: manifestSchema.describe("Every figure printed in the workbook, tied to its snapshot path or derived op."),
      }),
      execute: async ({ workbookJson, manifest }) => {
        const out = await runRenderXlsxInSandbox({ snapshot, workbookJson, signal });
        if (out.exitCode === 0 && out.xlsxBytes !== null) {
          captured.render = { xlsxBytes: out.xlsxBytes, manifest };
          return { ok: true as const };
        }
        return {
          ok: false as const,
          error: truncate(out.stderr || out.stdout || "render produced no workbook", 800),
        };
      },
    });

    await generateText({
      model: createGatewayModel(CODEGEN_MODEL),
      system: buildCodegenWorkbookSystemPrompt(snapshot),
      prompt: input.request?.trim() || HARDCODED_ASK,
      tools: { renderWorkbook },
      stopWhen: stepCountIs(CODEGEN_MAX_STEPS),
      abortSignal: signal,
    });

    const finalRender = captured.render;
    if (finalRender === null) {
      return await fallbackToWorkbook(deps);
    }

    // FAIL-CLOSED: reopen the produced .xlsx in-process and require every cell number to trace to the
    // snapshot (literal) or a verifier-recomputed derived value. A null (oversized / decompression-bomb
    // / formula cell / parse failure) or a verify reject both fall back to the deterministic workbook.
    const cellText = await extractXlsxNumbers(finalRender.xlsxBytes);
    if (cellText === null) {
      return await fallbackToWorkbook(deps);
    }
    const verdict = verifyWorkbookArtifact(snapshot, finalRender.manifest, cellText);
    if (!verdict.ok) {
      return await fallbackToWorkbook(deps);
    }

    return {
      kind: "file",
      preview: "Here is your custom Excel workbook.",
      fileName: workbookFileName(deps.farmName),
      contentType: XLSX_CONTENT_TYPE,
      bytes: finalRender.xlsxBytes,
      meterCount: snapshot.meterCount,
      coverageAsOf: snapshot.coverageAsOf,
      params: { ask: input.request?.trim() || HARDCODED_ASK },
    };
  } catch {
    // Any failure (snapshot read, model, sandbox, extraction) becomes the deterministic fallback —
    // never a raw throw to the responder and never a partial/empty file.
    return await fallbackToWorkbook(deps);
  }
}
