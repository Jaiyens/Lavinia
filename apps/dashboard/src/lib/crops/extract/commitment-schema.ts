// The RawExtraction layer for grower COMMITMENT documents (handler assignment / sales-commitment
// reports: pounds a grower has committed to a named handler/buyer, optionally at a stated price).
// Sibling of schema.ts (settlement statements): exactly what Claude returns per document, validated
// by Zod (the single source of truth — every TS type here is `z.infer` of its schema). Committed
// pounds are WHOLE integer pounds (the reconciliation surface); price is INTEGER CENTS PER POUND
// (money law: integer cents, never float dollars).
//
// Same pound-gate discipline as settlements: the line-item committed pounds AND the document's
// PRINTED control total are extracted SEPARATELY. `controlTotalPounds` is the total as PRINTED on the
// report, never a re-sum of the rows — a model that re-derives the total from its own rows would
// always "reconcile" and the gate would certify nothing. Price RIDES ALONG with the gated pounds; the
// gate certifies POUNDS only, never the price.

import { z } from "zod";
import { CentsPerPound, Pounds } from "./schema";

/**
 * One commitment line as printed on a handler report: which handler/buyer, the variety, the committed
 * pounds, and (optionally) the stated price in cents/lb. `priceCentsPerPound` is null when the
 * commitment is pounds-only (price TBD at pool true-up) or the report prints no price.
 */
export const CommitmentRowSchema = z.object({
  handler: z.string().min(1).describe("handler / buyer name as printed, e.g. Holland Nut"),
  variety: z.string().min(1).describe("almond variety as printed, e.g. Nonpareil, Monterey"),
  committedPounds: Pounds.describe("whole pounds committed to this handler for this variety"),
  priceCentsPerPound: CentsPerPound.nullable()
    .optional()
    .describe(
      "the committed price in whole cents per pound, if the report prints one; null/omitted for a pounds-only commitment. Rides along with the gated pounds; never gated itself",
    ),
});
export type CommitmentRow = z.infer<typeof CommitmentRowSchema>;

/**
 * One extracted commitment document. `controlTotalPounds` is the report's PRINTED grand total of
 * committed pounds (its own stated figure) extracted INDEPENDENTLY of `rows` — never summed from
 * them. Null when the report prints no grand total: the pound-gate then routes to needs_review (it
 * can certify nothing against a missing control total).
 *
 * `confidence` is the model's own 0..1 self-rating; the cascade uses it to decide whether to escalate
 * Sonnet -> Opus. Advisory only and NEVER substitutes for the gate.
 */
export const CommitmentExtractionSchema = z.object({
  rows: z.array(CommitmentRowSchema).describe("every committed-pound line on the report"),
  controlTotalPounds: Pounds.nullable().describe(
    "the report's PRINTED grand total of committed pounds, read independently of the rows; null if none printed",
  ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("the model's own 0..1 confidence in this extraction; advisory, never overrides the gate"),
});
export type CommitmentExtraction = z.infer<typeof CommitmentExtractionSchema>;
