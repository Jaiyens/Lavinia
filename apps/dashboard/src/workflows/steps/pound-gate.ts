"use step";

// Workflow STEP: poundGate. On deploy the WDK build adapter makes this a durable step; locally it is
// a plain async function.
//
// This step is REAL and deterministic — it calls the actual pound-gate pure function
// (reconcileDocument), NEVER a model. It is the trust boundary of the whole ingest: extracted rows
// become real ONLY when they sum to within tolerance of the document's OWN stated control total.
// A corrupted page (line items that disagree with the printed total, or a missing total) routes to
// "needs_review" and is withheld, never written as a wrong number.

import { reconcileDocument, sumLineItemPounds, type PoundLineItem } from "@/lib/crops/pound-gate";
import type { PoundCoverage } from "@/lib/crops/types";

export type PoundGateStepInput = {
  rows: readonly PoundLineItem[];
  controlTotalPounds: number | null;
};

export type PoundGateStepOutput = {
  rows: PoundLineItem[];
  controlTotalPounds: number | null;
  /** The line-item sum (provenance; the gate's surface). */
  sumPounds: number;
  /** The deterministic verdict. Only "reconciled" rows should be written as production. */
  coverage: PoundCoverage;
};

/** Run the deterministic pound-gate over one document's extracted rows + its stated total. */
export function poundGateStep(input: PoundGateStepInput): Promise<PoundGateStepOutput> {
  const coverage = reconcileDocument(input.rows, input.controlTotalPounds);
  return Promise.resolve({
    rows: [...input.rows],
    controlTotalPounds: input.controlTotalPounds,
    sumPounds: sumLineItemPounds(input.rows),
    coverage,
  });
}
