// The shared Sonnet -> Opus extraction cascade (Crops rule 6 floor), factored out of reader.ts so
// every grower-document reader (settlement statements, handler commitment reports) reuses ONE
// escalation policy instead of copying it. The cascade is purely a COST lever: Sonnet first, escalate
// to Opus when the model's confidence is low OR the rows are a pound-gate near-miss (they nearly
// reconcile, suggesting one mis-read digit Opus can fix). Escalation buys a better extraction, NEVER
// a bypass of reconciliation — every output still faces the deterministic pound-gate downstream.
//
// This module imports NOTHING from `@/lib/ai/gateway`. The live pass is built on `createZdrModel`
// (the direct Anthropic zero-data-retention endpoint) ONLY; the import-guard test
// (extract/zdr-boundary.test.ts) fails the build if that rule is ever broken here.

import { generateObject } from "ai";
import type { z } from "zod";
import { createZdrModel } from "@/lib/ai/zdr";
import { reconcileDocument, type PoundLineItem } from "@/lib/crops/pound-gate";

/** The reader's tier vocabulary. Sonnet first, Opus on escalation — both over the ZDR endpoint. */
export const SONNET_MODEL = "claude-sonnet-4-6";
export const OPUS_MODEL = "claude-opus-4-8";

/**
 * Below this self-rated confidence we escalate Sonnet -> Opus. Advisory only: confidence never
 * certifies a figure (the pound-gate does), it only decides whether a second, stronger pass is worth
 * the cost.
 */
export const ESCALATE_BELOW_CONFIDENCE = 0.85;

/**
 * A "near-miss" is a non-reconciling extraction whose row sum lands within this many pounds of the
 * stated control total — the signature of a single mis-read digit Opus may correct. A wider gap is a
 * structural miss (a dropped row); re-running rarely helps, so we do not escalate on it. The gate
 * tolerance itself stays 0 (see pound-gate.ts) — this window only gates ESCALATION, never certifies.
 */
export const NEAR_MISS_POUNDS = 2_000;

/**
 * The minimal shape the cascade needs to decide escalation: a per-row pound surface, the document's
 * SEPARATELY-stated control total, and the model's own advisory confidence. Both the settlement
 * extraction and the commitment extraction satisfy this (they each carry richer fields too).
 */
export type GateableExtraction = {
  rows: readonly PoundLineItem[];
  controlTotalPounds: number | null;
  confidence: number;
};

/** Whether a first (Sonnet) pass warrants the costlier Opus pass: low confidence OR a gate near-miss. */
export function shouldEscalate(extraction: GateableExtraction): boolean {
  if (extraction.confidence < ESCALATE_BELOW_CONFIDENCE) return true;
  return isNearMiss(extraction);
}

/** A near-miss: rows do not reconcile, but their sum is within NEAR_MISS_POUNDS of the stated total. */
function isNearMiss(extraction: GateableExtraction): boolean {
  const { controlTotalPounds } = extraction;
  if (controlTotalPounds === null) return false;
  const rows = extraction.rows;
  if (reconcileDocument(rows, controlTotalPounds) === "reconciled") return false;
  const sum = rows.reduce((acc, r) => acc + r.pounds, 0);
  return Math.abs(sum - controlTotalPounds) <= NEAR_MISS_POUNDS;
}

/**
 * One generateObject pass over a ZDR-backed model. Centralizes the prompt + schema call for every
 * tier and every reader. `gate` projects the validated object down to the cascade's escalation
 * surface (a settlement maps its pound rows; a commitment maps its committed-pound rows) so the
 * cascade can decide escalation without knowing the document's shape.
 */
export async function extractWith<T>(
  modelId: string,
  schema: z.ZodType<T>,
  schemaName: string,
  prompt: string,
  page: string,
): Promise<T> {
  const { object } = await generateObject({
    model: createZdrModel(modelId),
    schema,
    schemaName,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "text", text: page },
        ],
      },
    ],
  });
  return object;
}

/**
 * Run the full Sonnet -> Opus cascade for one document. Sonnet first; if `gate(first)` warrants it
 * (low confidence or a pound-gate near-miss), run the costlier Opus pass and return that. The Opus
 * output faces the same downstream gate — escalation never bypasses reconciliation. `gate` adapts the
 * concrete extraction type to the cascade's escalation surface.
 */
export async function runCascade<T>(args: {
  schema: z.ZodType<T>;
  schemaName: string;
  prompt: string;
  page: string;
  gate: (extraction: T) => GateableExtraction;
}): Promise<T> {
  const first = await extractWith(SONNET_MODEL, args.schema, args.schemaName, args.prompt, args.page);
  if (!shouldEscalate(args.gate(first))) return first;
  // Stronger second pass. Opus output still faces the same gate downstream.
  return extractWith(OPUS_MODEL, args.schema, args.schemaName, args.prompt, args.page);
}
