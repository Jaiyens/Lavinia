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

// Copy-law pins for Almond's action-chip labels (Story 7.5, FR2 / FR20). Each navigation Almond
// drives leaves a chip the grower can read and tap back to. The labels must be plain operator
// English — name what happened, no kW/tariff/interval jargon, no exclamation marks, no em dashes.
describe("action-chip navigation copy (the FR-2 / FR-20 voice law)", () => {
  const n = en.shell.almond.navigated;
  const sample = [
    n.meter("Westside Pump 17"),
    n.meterFallback,
    n.closed,
    n.lens("map"),
    n.filtered("AG-4 meters"),
    n.lensAndFilter("table", "AG-4 meters"),
    n.fallback,
    n.ranchSuffix("Westside"),
    n.rateSuffix("AG-4"),
    en.shell.almond.navigatedAria("Opened Westside Pump 17"),
  ].join(" ");

  it("names the action in plain words (no kW/tariff/interval jargon)", () => {
    expect(n.meter("Pump 9")).toBe("Opened Pump 9");
    expect(n.lens("map")).toBe("Showed the map");
    expect(sample).not.toMatch(/\bkW\b/i);
    expect(sample).not.toMatch(/tariff/i);
    expect(sample).not.toMatch(/interval/i);
  });

  it("uses plain operator voice: no em dashes, no exclamation marks", () => {
    expect(sample).not.toContain("—");
    expect(sample).not.toContain("!");
  });
});

// Copy-law pins for Almond's empty-chat starter prompts (Story 10.1, FR21 / FR20 / UX-DR6). The
// starters now advertise Almond's action/export powers; every prompt stays plain operator English —
// name the thing, no kW/tariff/interval jargon, no exclamation marks, no em dashes.
describe("almond starter copy (the FR-21 / FR-20 voice law)", () => {
  const s = en.shell.almond.starters;
  const all = Object.values(s).join(" ");

  it("phrases the new action and export starters in plain words", () => {
    expect(s.openBiggestOpportunity).toBe("Open my biggest opportunity");
    expect(s.exportMeters).toBe("Export my meters as a spreadsheet");
    expect(s.misRatedPdf).toBe("Make a PDF of my mis-rated pumps");
  });

  it("uses no kW/tariff/interval jargon", () => {
    expect(all).not.toMatch(/\bkW\b/i);
    expect(all).not.toMatch(/tariff/i);
    expect(all).not.toMatch(/interval/i);
  });

  it("uses plain operator voice: no em dashes, no exclamation marks", () => {
    expect(all).not.toContain("—");
    expect(all).not.toContain("!");
  });
});

// Copy-law pins for the first-run nudge + rail entry (Story 10.2, FR21 / FR22 / UX-DR5 / UX-DR4).
// The nudge points the grower at Almond once, in calm plain operator English — no jargon, no
// exclamation marks, no em dashes — and the rail entry is the quiet, persistent way to find Almond.
describe("almond surfacing copy (the FR-21 / FR-22 / FR-20 voice law)", () => {
  const a = en.shell.almond;
  const all = [a.railLabel, a.nudge.title, a.nudge.body, a.nudge.cta, a.nudge.dismiss].join(" ");

  it("phrases the rail entry and the first-run nudge in plain words", () => {
    expect(a.railLabel).toBe("Ask Almond");
    expect(a.nudge.title).toBe("Meet Almond");
    expect(a.nudge.body).toBe("Ask Almond to show you your most expensive meter.");
    expect(a.nudge.cta).toBe("Show me");
  });

  it("uses no kW/tariff/interval jargon", () => {
    expect(all).not.toMatch(/\bkW\b/i);
    expect(all).not.toMatch(/tariff/i);
    expect(all).not.toMatch(/interval/i);
  });

  it("uses plain operator voice: no em dashes, no exclamation marks", () => {
    expect(all).not.toContain("—");
    expect(all).not.toContain("!");
  });
});

// The Auto decision line names what Almond did in one calm sentence (Perplexity-Auto for Almond):
// plain operator English, no kW/tariff/interval jargon, no exclamation marks, no em dashes.
describe("almond Auto decision copy (the voice law)", () => {
  const a = en.shell.almond.auto;
  const all = Object.values(a).join(" ");

  it("phrases the picker entry and each decision in plain words", () => {
    expect(a.label).toBe("Auto");
    expect(a.buildingNew).toBe("Building a new file");
    expect(a.answeredDirect).toBe("Answered from your farm data");
    expect(a.navigated).toBe("Moved you there");
    expect(a.readingAttachment).toBe("Reading your attachment");
  });

  it("uses no kW/tariff/interval jargon", () => {
    expect(all).not.toMatch(/\bkW\b/i);
    expect(all).not.toMatch(/tariff/i);
    expect(all).not.toMatch(/interval/i);
  });

  it("uses plain operator voice: no em dashes, no exclamation marks", () => {
    expect(all).not.toContain("—");
    expect(all).not.toContain("!");
  });
});
