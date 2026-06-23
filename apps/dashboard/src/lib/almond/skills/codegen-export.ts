import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { en } from "@/copy/en";
import { createGatewayModel } from "@/lib/ai/gateway";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import { runGenerateReport } from "@/lib/almond/skills/generate-report";
import { buildReportSnapshot, type ReportSnapshot } from "@/lib/almond/codegen/snapshot";
import { renderPdf, CodegenRuntimeUnavailableError } from "@/lib/almond/codegen/run";
import { extractPdfText, verifyWorkbookArtifact } from "@/lib/almond/codegen/verify";
import { billableTokens, recordUsage } from "@/lib/almond/usage-budget";

/**
 * The `codegenExport` skill — the DEFAULT report path. Almond builds the grower's PDF by WRITING the
 * report's HTML/CSS over the farm snapshot, which a runtime (Vercel Sandbox in prod, a local subprocess
 * in dev) renders with WeasyPrint. The model has full HTML/CSS freedom, so the report can be the whole
 * farm or a niche slice the grower describes, laid out however they ask. Every report is generated FROM
 * SCRATCH each turn (no cache, no fixed template).
 *
 * NUMBER HONESTY (the one guard, fail-closed but fix-and-retry): the model declares every figure in a
 * manifest (a literal snapshot value, or a verifier-recomputed sum/count); after each render the rendered
 * PDF's text is scanned against the snapshot allowlist. A mismatch is fed BACK to the model (named) so it
 * repairs and re-renders within the step budget — never a silent swap for a generic template. Only a
 * genuinely UNAVAILABLE runtime falls back to the deterministic report; a model/verify failure with the
 * runtime up is an honest error.
 */

/** The codegen model: Sonnet 4.6 (markup generation is a Sonnet task; the alias matches the picker
 *  allowlist in src/lib/almond/models.ts). */
const CODEGEN_MODEL = "anthropic/claude-sonnet-4.6";

/** The default ask when the grower did not phrase a specific one. */
const HARDCODED_ASK =
  "Build a clean, professional PDF report for the farm: a short summary, then the farm's top rate-switch opportunities (meter, current rate, suggested rate, estimated annual savings) and the total estimated savings. Use only the data in the snapshot.";

/** Max steps for the codegen loop (write markup -> render -> see error/verify-fail -> fix -> render). */
const CODEGEN_MAX_STEPS = 6;

/** The skill's input: the grower's request, in their words. The model writes the report to match it. */
export const codegenExportInputSchema = z.object({
  request: z
    .string()
    .optional()
    .describe(
      "The grower's report request in their own words, including scope (whole farm or a specific entity/ranch/rate) and any styling. Used as the build prompt and kept for the Reports history.",
    ),
});

export type CodegenExportInput = z.infer<typeof codegenExportInputSchema>;

/** The outcome the skill returns to the responder. Mirrors the file-skill shape so the responder's
 *  persist-and-stream path serves it unchanged. */
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
      /** True when these bytes are the DETERMINISTIC fallback (runtime unavailable). */
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
  return `${slug(farmName)}-report.pdf`;
}

/** Truncate model-visible text (runtime stderr) so a stack trace never bloats the prompt window. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** The figure manifest the model declares (literal snapshot value, or a verifier-recomputed sum/count) —
 *  the same derived-capable shape the workbook codegen uses, so a report total is provable too. */
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
 * The deterministic fallback: the report template (savings + summary). Served ONLY when the code runtime
 * is unavailable (offline/CI/outage), so the grower still gets a real document.
 */
async function fallbackToTemplate(deps: AlmondToolDeps): Promise<CodegenExportResult> {
  const r = await runGenerateReport(deps, { sections: ["savings", "summary"] });
  return r.kind === "file" ? { ...r, fromFallback: true } : r;
}

/** The codegen system prompt: the report contract, the brand tokens (with full freedom to honor the
 *  grower's styling), the number-honesty laws, and the snapshot. */
function buildCodegenSystemPrompt(snapshot: ReportSnapshot): string {
  return [
    "You write the grower's PDF report as a self-contained HTML document plus a CSS stylesheet, then call",
    "the renderReport tool to render it with WeasyPrint. You do NOT write any executable code.",
    "",
    "STYLING — YOU HAVE FULL FREEDOM. Lay the report out however the grower asks (their scope, sections,",
    "colors, emphasis). The Terra defaults, when the grower does not specify: a cool light-grey paper",
    "(#eef1f5), near-black charcoal text (#16181d), brand green (#2fa84f) for accents, gold (#f2c14e) for a",
    "highlight, a clean sans-serif body, and `@page { size: Letter; margin: 1in }`. Honor any explicit",
    "color/font/layout the grower requests over these defaults.",
    "",
    "NUMBERS — THE ONE HARD RULE. Every NUMBER you print MUST come from the snapshot: a LITERAL snapshot",
    "value, or a value you DERIVE only via the manifest (a sum or count the verifier recomputes). Never",
    "invent, estimate, or round a number that is not provable from the snapshot. Render money the way the",
    "snapshot does (dollars and cents with thousands separators); the snapshot's money fields are integer",
    "cents and carry a pre-formatted display string where one is provided.",
    "",
    "MANIFEST. When you call renderReport, pass a manifest listing EVERY figure you printed:",
    "  - LITERAL: { label, value, sourcePath } where value is the figure in integer CENTS and sourcePath is",
    '    its snapshot path, e.g. "opportunities[0].savingsCents" or "totals.rateSwitchSavingsCents".',
    '  - DERIVED (a total/count you compute): { kind: "derived", label, value, op, sourcePaths }. op "sum"',
    "    sums the CENTS at every sourcePath; op \"count\" is the length of the array at sourcePaths[0]. The",
    "    verifier recomputes it; a wrong value is rejected.",
    "If a number you printed has no manifest entry, or your value does not match, the render is rejected and",
    "you will be told which number — fix the markup and call renderReport again.",
    "",
    "SNAPSHOT (the only source of truth):",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");
}

/** What one verified render captured (held in a closure the render tool writes). */
type RenderCapture = { pdfBytes: Buffer; manifest: unknown };

/**
 * Run the report codegen. Builds the snapshot, runs the model loop (write markup -> render -> verify the
 * rendered PDF fail-closed -> on a number mismatch feed it back to repair), and returns the verified file.
 * A genuinely unavailable runtime falls back to the deterministic report; a model/verify failure with the
 * runtime UP is an honest error. Scope is inherited from `deps`; `signal` is threaded through.
 */
export async function runCodegenExport(
  deps: AlmondToolDeps,
  input: CodegenExportInput,
  signal?: AbortSignal,
): Promise<CodegenExportResult> {
  try {
    const snapshot = await buildReportSnapshot(deps);
    // Nothing to ground a report on -> let the deterministic template return its honest empty/file outcome.
    if (snapshot.opportunities.length === 0 && snapshot.meters.length === 0) {
      return await fallbackToTemplate(deps);
    }

    const captured: { render: RenderCapture | null; runtimeDown: boolean } = {
      render: null,
      runtimeDown: false,
    };

    const renderReport = tool({
      description:
        "Render the report to PDF by running WeasyPrint over your markup. Pass the complete report.html, the styles.css, and a manifest of every figure you printed (each with its snapshot sourcePath, or a derived op). Returns whether the PDF built AND verified; if not, fix the markup and call again.",
      inputSchema: z.object({
        html: z.string().describe("A complete, self-contained HTML document for the report."),
        css: z.string().describe("The stylesheet."),
        manifest: manifestSchema.describe("Every figure printed in the report, tied to its snapshot path or derived op."),
      }),
      execute: async ({ html, css, manifest }) => {
        let out: { pdfBytes: Buffer | null; stdout: string; stderr: string; exitCode: number };
        try {
          out = await renderPdf({ snapshot, html, css, signal });
        } catch (e) {
          captured.runtimeDown = true;
          if (e instanceof CodegenRuntimeUnavailableError) {
            return { ok: false as const, error: "the render runtime is unavailable" };
          }
          return { ok: false as const, error: "the render runtime failed to start" };
        }

        if (out.exitCode !== 0 || out.pdfBytes === null) {
          return { ok: false as const, error: truncate(out.stderr || out.stdout || "render produced no PDF", 800) };
        }

        // Verify the rendered PDF fail-closed; a number mismatch is fed back so the model repairs.
        const pdfText = await extractPdfText(out.pdfBytes);
        const verdict = verifyWorkbookArtifact(snapshot, manifest, pdfText);
        if (!verdict.ok) {
          return {
            ok: false as const,
            error: `a number could not be verified against the farm data (${verdict.reason}). Every printed number must come from the snapshot (a literal value or a declared sum/count). Fix it and call renderReport again.`,
          };
        }

        captured.render = { pdfBytes: out.pdfBytes, manifest };
        return { ok: true as const };
      },
    });

    const gen = await generateText({
      model: createGatewayModel(CODEGEN_MODEL),
      system: buildCodegenSystemPrompt(snapshot),
      prompt: input.request?.trim() || HARDCODED_ASK,
      tools: { renderReport },
      stopWhen: stepCountIs(CODEGEN_MAX_STEPS),
      abortSignal: signal,
    });

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
        preview: "Here is your custom report.",
        fileName: codegenFileName(deps.farmName),
        contentType: PDF_CONTENT_TYPE,
        bytes: captured.render.pdfBytes,
        meterCount: snapshot.meterCount,
        coverageAsOf: snapshot.coverageAsOf,
        params: { ask: input.request?.trim() || HARDCODED_ASK },
      };
    }

    if (captured.runtimeDown) return await fallbackToTemplate(deps);
    return { kind: "error", message: en.shell.almond.export.skill.error };
  } catch {
    return await fallbackToTemplate(deps);
  }
}
