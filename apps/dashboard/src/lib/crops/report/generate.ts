// generateCropReport: write a production / bank-style crop report whose PROSE is generated AROUND a
// numbers-locked context. The figures come ONLY from buildReportContext(positions) — itself built
// purely off the deterministic position — and the model is forbidden from introducing, restating
// differently, or computing any number not in that context. The model writes the words; the ledger
// owns every pound.
//
// OFFLINE / TESTABLE BOUNDARY: the text generator is an INJECTED dependency (`deps.generate`),
// defaulting to a stub that emits the verified block verbatim with a short deterministic preamble.
// So typecheck and the pure tests run with ZERO external calls and no key. A live caller injects a
// thin adapter over the AI SDK's generateText (see `gatewayCropReportGenerator`), constructing the
// gateway model only when a key is present — exactly the offline-green law the rest of the repo
// follows. The numbers are NEVER sourced from the model: even the live path only rewords prose
// around the same locked block.

import { buildReportContext, type CropReportContext } from "./context";
import type { Positions } from "../types";

/** The persisted/returned report kind. Additive String (no migration) — wired into the store's
 *  GENERATED_REPORT_KINDS union so a crop report round-trips through the existing persistence. */
export const CROP_PRODUCTION_REPORT_KIND = "crop_production" as const;
export type CropProductionReportKind = typeof CROP_PRODUCTION_REPORT_KIND;

/** The injected text-generation boundary. The structural shape of the AI SDK's `generateText` that
 *  this module uses (system + prompt in, `{ text }` out), narrowed to exactly what we need so a stub
 *  can satisfy it without importing the AI SDK and the live adapter can wrap the real call. */
export type CropReportTextGenerator = (input: {
  system: string;
  prompt: string;
}) => Promise<{ text: string }>;

/** The deps `generateCropReport` closes over. Only the text generator is injected; everything else
 *  is derived deterministically from the positions. Defaults to the offline stub. */
export type GenerateCropReportDeps = {
  /** The prose generator. Defaults to `stubCropReportGenerator` (zero external calls). */
  generate?: CropReportTextGenerator;
  /** Optional report title override. Defaults to a stable, deterministic title. */
  title?: string;
};

/** The generated report. `prose` is the model's words; `context` is the numbers-locked source of
 *  every figure (returned so a caller can assert the prose introduced nothing, and so persistence
 *  records the same verified figures the prose is wrapped around). */
export type GeneratedCropReport = {
  kind: CropProductionReportKind;
  title: string;
  prose: string;
  context: CropReportContext;
};

/** The default, deterministic report title. */
export const DEFAULT_CROP_REPORT_TITLE = "Crop Production Position";

/**
 * The system instruction handed to the model. It states the law plainly: the verified figures are
 * provided, the model writes the report PROSE around them, and it must NEVER introduce, restate
 * differently, or compute any number not present in the provided block. It must reproduce the block
 * verbatim where it states figures. This text is the same on the stub and live paths (the stub just
 * ignores it), so the rule the live model is held to is visible and testable.
 */
export const CROP_REPORT_SYSTEM =
  "You are writing a crop production position report for an almond grower, in plain operator " +
  "English, in the style of a production / bank statement. You will be given a VERIFIED FIGURES " +
  "block. STRICT RULES: every pound figure you state MUST be copied verbatim from that block. Do " +
  "NOT introduce any number that is not in the block. Do NOT restate a number in a different form " +
  "(no rounding, no unit changes, no re-grouping). Do NOT compute, sum, subtract, or derive any " +
  "number yourself — the totals and gaps are already in the block. Label settled cells as final " +
  "and estimate cells as estimates, exactly as the block marks them. You may add framing words " +
  "around the figures, but the figures themselves come only from the block.";

/** Build the prompt: the instruction's running mate. Hands the model the verbatim block and asks it
 *  to write the prose around it. Pure string assembly off the locked context. */
function buildPrompt(context: CropReportContext): string {
  return [
    "Here are the verified figures. Write the production report prose around them. Copy every",
    "figure exactly as written; introduce no number that is not below.",
    "",
    "--- VERIFIED FIGURES (copy verbatim) ---",
    context.block,
    "--- END VERIFIED FIGURES ---",
  ].join("\n");
}

/**
 * The default offline generator: it makes ZERO external calls and emits the verified block verbatim
 * under a short, deterministic preamble. Because it copies the block exactly, it introduces no
 * number of its own — which is precisely the property the live model is held to, so the stub is a
 * faithful (if plain) stand-in for tests, typecheck, and dev. Deterministic: same input => same out.
 */
export const stubCropReportGenerator: CropReportTextGenerator = async ({ prompt }) => {
  // The block is delimited in the prompt; echo the whole prompt body so every locked figure (and
  // nothing else numeric) appears in the prose. A real model would reword the framing around it.
  const preamble =
    "Crop production position, drawn from the verified ledger figures below. Figures are stated " +
    "exactly as recorded; estimates and settled (final) figures are labeled as such.";
  return { text: `${preamble}\n\n${prompt}` };
};

/**
 * Generate a crop production report whose prose is written around the numbers-locked context.
 *
 * 1. Build the context PURELY from `positions` (the only source of numbers).
 * 2. Call the injected `generate` (defaulting to the offline stub) with the figure-forbidding
 *    instruction and the verbatim-figures prompt.
 * 3. Return { kind, title, prose, context } — `context` is exactly buildReportContext(positions),
 *    so a caller (and the tests) can prove the prose introduced no number the ledger did not.
 *
 * The model never sees the ledger and never computes a pound; it only rewords around the block.
 */
export async function generateCropReport(
  deps: GenerateCropReportDeps,
  positions: Positions,
): Promise<GeneratedCropReport> {
  const context = buildReportContext(positions);
  const generate = deps.generate ?? stubCropReportGenerator;

  const { text } = await generate({
    system: CROP_REPORT_SYSTEM,
    prompt: buildPrompt(context),
  });

  return {
    kind: CROP_PRODUCTION_REPORT_KIND,
    title: deps.title ?? DEFAULT_CROP_REPORT_TITLE,
    prose: text.trim(),
    context,
  };
}

/**
 * A live adapter over the AI SDK's `generateText` via the shared gateway. Construct this ONLY when a
 * Gateway key is present; it imports the AI SDK + gateway lazily so a no-key path never loads them.
 * Pass it as `deps.generate`. Even here the figures come only from the prompt's verbatim block — the
 * model rewords prose, it is never the source of a number.
 */
export function gatewayCropReportGenerator(modelId?: string): CropReportTextGenerator {
  return async ({ system, prompt }) => {
    const { generateText } = await import("ai");
    const { createGatewayModel } = await import("@/lib/ai/gateway");
    const model = createGatewayModel(modelId);
    const { text } = await generateText({ model, system, prompt });
    return { text };
  };
}
