import { describe, expect, it } from "vitest";
import { en } from "./en";

// Copy-law pins for the bill-accuracy verification badge (Story 4.1, FR-19 / AC2,
// AC3 / NFR-5). Phrase-level, not single-character (the 3.7 lesson: a pin that can
// only pass vacuously protects nothing). The two-layer claim must stay honest:
//   - the cent-exact wording belongs ONLY to the line-item reconciliation fact;
//   - the recompute sentence claims a "match", never the cent, and NEVER a forecast.
describe("verification badge copy (the FR-19 copy law)", () => {
  const { verifiedLabel, verifiedCaption } = en.shell.drawer;
  const all = `${verifiedLabel} ${verifiedCaption}`;

  // Split the caption into sentences so each layer can be asserted on its own.
  const sentences = verifiedCaption
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const recomputeSentence = sentences.find((s) => /recalculated/i.test(s));
  const reconcileSentence = sentences.find((s) => /to the cent/i.test(s));

  it("states the independent-recompute claim", () => {
    expect(recomputeSentence).toBeDefined();
    expect(recomputeSentence).toMatch(/independently/i);
    expect(recomputeSentence).toMatch(/matched/i);
  });

  it("never claims prediction, forecast, or projection", () => {
    // Substring (no anchors) so conjugations are covered too: "predict" catches
    // predicted/prediction/predicts, "forecast" catches forecasted/forecasting,
    // and "project" catches projection/projected/projecting.
    expect(all).not.toMatch(/predict/i);
    expect(all).not.toMatch(/forecast/i);
    expect(all).not.toMatch(/project/i);
  });

  it("attaches the cent-exact claim ONLY to the line-item reconciliation, never the recompute", () => {
    // Layer 1 owns "to the cent".
    expect(reconcileSentence).toBeDefined();
    expect(reconcileSentence).toMatch(/to the cent/i);
    // Layer 2 (the recompute) must not borrow cent precision it does not have.
    expect(recomputeSentence).toBeDefined();
    expect(recomputeSentence).not.toMatch(/cent/i);
    // And the cent-exact sentence must not be the recompute sentence.
    expect(reconcileSentence).not.toMatch(/recalculated|independently/i);
  });

  it("uses plain operator voice: no em dashes, no exclamation marks", () => {
    expect(all).not.toContain("—"); // em dash
    expect(all).not.toContain("!");
  });
});

// Copy-law pins for the predicted-vs-realized result surface (Story 4.2, FR-20 / AC3).
// v1 shows the diff and does NOT explain or attribute it: the result copy must say
// "pending" honestly and must never claim the grower saved the predicted amount or
// explain the variance.
describe("tracked-results copy (the FR-20 honesty law)", () => {
  const d = en.shell.drawer;
  const resultCopy = [
    d.resultsHeader,
    d.resultPredictedLabel,
    d.resultRealizedLabel,
    d.resultPending,
    d.resultNoEstimate,
  ].join(" ");

  it("states the pending-until-the-next-bill condition", () => {
    expect(d.resultPending).toMatch(/pending/i);
  });

  it("never attributes savings or explains the variance", () => {
    expect(resultCopy).not.toMatch(/you saved/i);
    expect(resultCopy).not.toMatch(/saved you/i);
    expect(resultCopy).not.toMatch(/\bsavings?\b/i);
    expect(resultCopy).not.toMatch(/because/i);
    expect(resultCopy).not.toMatch(/thanks to/i);
    expect(resultCopy).not.toMatch(/due to/i);
  });

  it("uses plain operator voice: no em dashes, no exclamation marks", () => {
    expect(resultCopy).not.toContain("—");
    expect(resultCopy).not.toContain("!");
  });
});
