// Document-class detection for grower report PDFs: is this a packer SETTLEMENT statement (final
// pounds, supersedes the estimate) or a handler COMMITMENT report (pounds committed to a buyer)? The
// two route to different schemas, readers, and write steps, so the pipeline must classify a document
// before extracting it. Classification is a cheap deterministic heuristic over the document's TEXT
// (no model call) — the EXTRACTION that follows is the model's job and is gated regardless of class,
// so a mis-class is not a trust risk (it would simply land needs_review against the wrong total).
//
// Heuristic: count commitment-signal terms vs settlement-signal terms in the text. Default to
// "settlement" on a tie or no signal (the more conservative class — a settlement supersedes an
// estimate and always shows the gap; a stray commitment mis-read as a settlement still faces the
// pound-gate).

export type DocClass = "settlement" | "commitment";

const COMMITMENT_SIGNALS = [
  "commitment",
  "committed",
  "assignment",
  "assigned",
  "contract",
  "handler",
  "sold to",
  "buyer",
] as const;

const SETTLEMENT_SIGNALS = [
  "settlement",
  "settled",
  "packer statement",
  "grade sheet",
  "turnout",
  "net pounds",
  "meat pounds",
  "grand total",
] as const;

/** Count how many of `signals` occur in `haystack` (lowercased, substring match, counts repeats). */
function countSignals(haystack: string, signals: readonly string[]): number {
  let n = 0;
  for (const term of signals) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(term, from);
      if (at === -1) break;
      n += 1;
      from = at + term.length;
    }
  }
  return n;
}

/**
 * Classify a report document by its text. Commitment wins only when its signal count STRICTLY exceeds
 * the settlement count; otherwise settlement (the conservative default). Pure and deterministic.
 */
export function classifyDoc(text: string): DocClass {
  const lower = text.toLowerCase();
  const commitment = countSignals(lower, COMMITMENT_SIGNALS);
  const settlement = countSignals(lower, SETTLEMENT_SIGNALS);
  return commitment > settlement ? "commitment" : "settlement";
}
