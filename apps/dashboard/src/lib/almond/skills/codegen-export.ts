import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createGatewayModel } from "@/lib/ai/gateway";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import { runGenerateReport } from "@/lib/almond/skills/generate-report";
import { buildReportSnapshot, type ReportSnapshot } from "@/lib/almond/codegen/snapshot";
import { runRenderInSandbox } from "@/lib/almond/codegen/sandbox-run";
import { extractPdfText, verifyArtifact, type ManifestEntry } from "@/lib/almond/codegen/verify";
import { billableTokens, recordUsage } from "@/lib/almond/usage-budget";

/**
 * The `codegenExport` skill (POC) — the long-tail escape hatch where Almond builds a BESPOKE PDF by
 * WRITING the report's markup (HTML/CSS), which a Vercel Sandbox renders with WeasyPrint, while a
 * fail-closed guard guarantees every printed number traces to the canonical snapshot. This is NOT the
 * default export path: the deterministic `generateReport`/`exportSpreadsheet` skills serve common asks
 * instantly; this is reserved for novel requests and is owner-only, flag-gated, throttled, and creds-
 * gated (the factory hands it to the model only when the flag + gateway key + sandbox creds + a built
 * snapshot id are all present — see src/lib/almond/codegen/flags.ts).
 *
 * POC scope: ONE hardcoded ask ("a one-page PDF of the top opportunities"). The model writes the markup
 * over the snapshot; the sandbox renders it; we extract the PDF text and VERIFY it (forward manifest +
 * reverse number-token scan, src/lib/almond/codegen/verify.ts). On ANY failure — no opportunities, model
 * error, sandbox error, verification reject — it FALLS BACK to the deterministic report template, so the
 * grower never gets a broken/empty file or a fabricated number.
 *
 * Result shape mirrors `GenerateReportResult` so the responder's existing persist-and-stream path
 * (`data-report` download card) serves it unchanged; the persisted `kind` is `"codegen"`.
 */

/** The codegen model: Sonnet 4.6 (markup generation is a Sonnet task; inference dominates cost). The
 *  exact gateway alias matches the picker allowlist (src/lib/almond/models.ts). */
const CODEGEN_MODEL = "anthropic/claude-sonnet-4.6";

/** The POC's single hardcoded ask handed to the codegen model. */
const HARDCODED_ASK =
  "Build a clean, professional one-page PDF report titled with the farm name that lists the farm's top rate-switch opportunities: for each, the meter name, the current rate, the suggested rate, and the estimated annual savings. End with the total estimated savings. Use only the data in the snapshot.";

/** Max steps for the nested codegen loop (write markup -> render -> see error -> fix -> render). */
const CODEGEN_MAX_STEPS = 4;

/** The skill's input: SHAPE ONLY, like the other file skills. An optional free-text `request` is carried
 *  for the Reports history; the POC renders the hardcoded ask regardless. No farmId, no values. */
export const codegenExportInputSchema = z.object({
  request: z
    .string()
    .optional()
    .describe("The grower's custom report request, captured verbatim for the Reports history."),
});

export type CodegenExportInput = z.infer<typeof codegenExportInputSchema>;

/**
 * The outcome the skill returns to the responder. A clean build carries the verified PDF bytes; an
 * empty/error outcome is typed (no download card). The file fields match `GenerateReportResult` so the
 * responder's `StreamableFile` path serves both; `params` is `Prisma.InputJsonValue` so it can hold the
 * codegen `{ ask }` OR (on fallback) the deterministic report's shape params.
 */
export type CodegenExportResult =
  | {
      kind: "file";
      preview: string;
      fileName: string;
      contentType: string;
      bytes: Uint8Array;
      meterCount: number;
      coverageAsOf: string | null;
      params: Prisma.InputJsonValue;
      /** The content-addressed cache key this bespoke file is stored under (Phase 2); the responder
       *  persists it so an identical later ask returns the verified bytes instantly. */
      cacheKey?: string;
      /** True when these bytes were served from the cache, so the responder streams them without
       *  persisting a duplicate row and without re-running the model + sandbox. */
      fromCache?: boolean;
      /** True when these bytes are the DETERMINISTIC fallback (not the verified bespoke render), so the
       *  skill wrapper does not cache them under the bespoke key (a one-off outage must not pin the
       *  generic report for 30 days). */
      fromFallback?: boolean;
    }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

const PDF_CONTENT_TYPE = "application/pdf";

/** A filesystem-safe slug for the farm name (no path, no separators). */
function slug(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "farm" : cleaned;
}

/** The server-authored download file name for a codegen report. */
function codegenFileName(farmName: string): string {
  return `${slug(farmName)}-opportunities.pdf`;
}

/** Truncate model-visible text (sandbox stderr) so a stack trace never bloats the prompt window. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * The deterministic fallback: today's report template (savings + summary). Used whenever the codegen
 * path cannot SAFELY produce a verified file, so the grower always gets a real document. The result is
 * assignable to `CodegenExportResult` (the file `params` widen to `Prisma.InputJsonValue`).
 */
async function fallbackToTemplate(deps: AlmondToolDeps): Promise<CodegenExportResult> {
  const r = await runGenerateReport(deps, { sections: ["savings", "summary"] });
  // Mark the fallback so the skill wrapper does not cache it under the bespoke key. runGenerateReport
  // has its OWN try/catch (returns a typed error, never throws), so this never throws to the responder.
  return r.kind === "file" ? { ...r, fromFallback: true } : r;
}

/** The codegen system prompt: the Terra brand tokens, the rules that keep every number grounded, and
 *  the snapshot data itself (passed hermetically). */
function buildCodegenSystemPrompt(snapshot: ReportSnapshot): string {
  return [
    "You write a single-page, print-ready PDF report as a self-contained HTML document plus a CSS",
    "stylesheet, then call the renderReport tool to render it. You do NOT write any executable code.",
    "",
    "ABSOLUTE RULE ON NUMBERS: every number you print MUST come verbatim from the SNAPSHOT below.",
    "Never compute, sum, round, or invent a number. Print each opportunity's savings using its exact",
    "`savingsDisplay` string, and the total using `totals.rateSwitchSavingsCents` (render it the same",
    "way, e.g. dollars and cents with thousands separators). Do NOT add dates, page numbers, phone",
    "numbers, percentages, or any figure not present in the snapshot.",
    "",
    "TERRA BRAND (use these tokens in the CSS):",
    "- page background #F7F2E6 (warm paper); body text and headings in forest green #1F3D2B.",
    "- headings/title font 'Fraunces', body font 'Hanken Grotesk', figures font 'JetBrains Mono'.",
    "- one page only; use @page { size: Letter; margin: 1in } and keep the layout calm and legible.",
    "",
    "MANIFEST: when you call renderReport, also pass a manifest listing EVERY figure you printed, each",
    "as { label, value, sourcePath } where `value` is the figure in integer CENTS exactly as in the",
    "snapshot and `sourcePath` is its path, e.g. \"opportunities[0].savingsCents\" or",
    "\"totals.rateSwitchSavingsCents\". If renderReport returns an error, fix the markup and call it again.",
    "",
    "SNAPSHOT (the only source of truth):",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");
}

/** What one render attempt captured (held in a closure the render tool writes). */
type RenderCapture = { pdfBytes: Buffer; manifest: ManifestEntry[] };

/**
 * Run the codegen export. Builds the snapshot, runs the nested model loop (the model writes markup and
 * calls the render tool, which executes WeasyPrint in a Vercel Sandbox), then verifies the rendered PDF
 * fail-closed. Falls back to the deterministic template on every non-success. Scope is inherited from
 * `deps`; `signal` (the chat tool-call's abort signal) is threaded into the model loop and the sandbox
 * so a closed tab does not leak a running microVM.
 */
export async function runCodegenExport(
  deps: AlmondToolDeps,
  input: CodegenExportInput,
  signal?: AbortSignal,
): Promise<CodegenExportResult> {
  try {
    const snapshot = await buildReportSnapshot(deps);
    // Nothing to report on -> let the deterministic template return its honest empty/file outcome.
    if (snapshot.opportunities.length === 0) {
      return await fallbackToTemplate(deps);
    }

    // Held in a container so the render tool's closure can record the latest successful render and the
    // skill can read it back after the loop (a captured `let` would be narrowed away by the compiler).
    const captured: { render: RenderCapture | null } = { render: null };

    const renderReport = tool({
      description:
        "Render the report to PDF. Pass the complete report.html, the styles.css, and a manifest of every figure you printed (each with its snapshot sourcePath). Returns whether the PDF built; if not, fix the markup and call again.",
      inputSchema: z.object({
        html: z.string().describe("A complete, self-contained HTML document for the one-page report."),
        css: z.string().describe("The stylesheet using the Terra brand tokens."),
        manifest: z
          .array(
            z.object({
              label: z.string().describe("A short label for the figure (for the audit trail)."),
              value: z.number().describe("The figure in integer CENTS, exactly as in the snapshot."),
              sourcePath: z
                .string()
                .describe('Path into the snapshot, e.g. "opportunities[0].savingsCents".'),
            }),
          )
          .describe("Every figure printed in the report, tied to its snapshot path."),
      }),
      execute: async ({ html, css, manifest }) => {
        const out = await runRenderInSandbox({ snapshot, html, css, signal });
        if (out.exitCode === 0 && out.pdfBytes !== null) {
          captured.render = { pdfBytes: out.pdfBytes, manifest };
          return { ok: true as const };
        }
        return {
          ok: false as const,
          error: truncate(out.stderr || out.stdout || "render produced no PDF", 800),
        };
      },
    });

    const gen = await generateText({
      model: createGatewayModel(CODEGEN_MODEL),
      system: buildCodegenSystemPrompt(snapshot),
      prompt: HARDCODED_ASK,
      tools: { renderReport },
      stopWhen: stepCountIs(CODEGEN_MAX_STEPS),
      abortSignal: signal,
    });

    // Account this codegen model spend against the per-user token budget (Story 10.4). It is a
    // SEPARATE model call from the chat turn (the Sonnet markup loop), so recording it is additive,
    // not double-counting. Best-effort; codegen is owner-only so meterUserId is non-null in practice.
    if (deps.meterUserId !== null) {
      await recordUsage(deps.prisma, {
        userId: deps.meterUserId,
        farmId: deps.farmId,
        source: "codegen",
        model: CODEGEN_MODEL,
        ...billableTokens(gen.totalUsage),
      });
    }

    // The model never produced a renderable PDF -> deterministic fallback (never a broken file).
    const finalRender = captured.render;
    if (finalRender === null) {
      return await fallbackToTemplate(deps);
    }

    // FAIL-CLOSED: the rendered PDF's numbers must all trace to the snapshot. A reject falls back to the
    // deterministic template rather than shipping a possibly-fabricated figure.
    const pdfText = await extractPdfText(finalRender.pdfBytes);
    const verdict = verifyArtifact(snapshot, finalRender.manifest, pdfText);
    if (!verdict.ok) {
      return await fallbackToTemplate(deps);
    }

    return {
      kind: "file",
      preview: "Here is your custom one-page report of the top opportunities.",
      fileName: codegenFileName(deps.farmName),
      contentType: PDF_CONTENT_TYPE,
      bytes: finalRender.pdfBytes,
      meterCount: snapshot.meterCount,
      coverageAsOf: snapshot.coverageAsOf,
      params: { ask: input.request?.trim() || HARDCODED_ASK },
    };
  } catch {
    // Any failure (snapshot read, model, sandbox, extraction) becomes the deterministic fallback - never
    // a raw throw to the responder and never a partial/empty file.
    return await fallbackToTemplate(deps);
  }
}
