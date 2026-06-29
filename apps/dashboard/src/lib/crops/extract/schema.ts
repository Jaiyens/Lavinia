// The RawExtraction layer for grower production documents (packer settlement statements). Exactly
// what Claude returns per page, validated by Zod (the single source of truth — every TS type here
// is `z.infer` of its schema). Pounds are WHOLE integer pounds (the reconciliation surface), mirror
// of the bill engine's integer-cents discipline.
//
// The whole point of the pound-gate: the line-item rows AND the document's printed grand total are
// extracted SEPARATELY. `controlTotalPounds` is the total as PRINTED on the statement, never a
// re-sum of the rows we just read — a model that re-derives the total from its own rows would always
// "reconcile" and the gate would certify nothing. So the schema models them as independent fields
// and the reader prompts for them independently.

import { z } from "zod";

/** Whole integer pounds, non-negative. The reconciliation surface (mirror of integer-cents Cents). */
export const Pounds = z
  .number()
  .int()
  .min(0)
  .describe("whole pounds as a non-negative integer, e.g. 120000 = 120,000 lb");

/**
 * Integer cents PER POUND, non-negative. The money surface (money law: integer cents, never float
 * dollars). e.g. $2.15/lb -> 215. Settlements and commitments both price in cents/lb.
 */
export const CentsPerPound = z
  .number()
  .int()
  .min(0)
  .describe("price as whole cents per pound, e.g. 215 = $2.15/lb");

/**
 * One weight line as printed on a packer statement: a variety, its settled pounds, and (optionally)
 * the settled price in cents/lb. The price RIDES ALONG with the gated pounds — it is never the
 * reconciliation surface (the pound-gate certifies POUNDS only). A statement that prints no per-row
 * price leaves `settledPriceCentsPerPound` null.
 */
export const PoundRowSchema = z.object({
  variety: z.string().min(1).describe("almond variety as printed, e.g. Nonpareil, Monterey"),
  pounds: Pounds,
  settledPriceCentsPerPound: CentsPerPound.nullable()
    .optional()
    .describe(
      "the settled price for this variety in whole cents per pound, if the statement prints one; null/omitted otherwise. Rides along with the gated pounds; never gated itself",
    ),
});
export type PoundRow = z.infer<typeof PoundRowSchema>;

/**
 * One extracted packer-statement page. `controlTotalPounds` is the document's PRINTED grand total
 * (its own stated figure) extracted INDEPENDENTLY of `rows` — never summed from them. Null when the
 * page prints no grand total: the pound-gate then routes to needs_review (it can certify nothing
 * against a missing control total — it must never self-check the rows against themselves).
 *
 * `confidence` is the model's own 0..1 self-rating of the extraction; the reader uses it to decide
 * whether to escalate Sonnet -> Opus. It is advisory only and NEVER substitutes for the gate — a
 * high-confidence extraction whose rows do not reconcile to the control total is still needs_review.
 */
export const PoundExtractionSchema = z.object({
  rows: z.array(PoundRowSchema).describe("every variety weight line on the statement"),
  controlTotalPounds: Pounds.nullable().describe(
    "the statement's PRINTED grand total in whole pounds, read independently of the rows; null if the page prints no grand total",
  ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("the model's own 0..1 confidence in this extraction; advisory, never overrides the gate"),
});
export type PoundExtraction = z.infer<typeof PoundExtractionSchema>;
