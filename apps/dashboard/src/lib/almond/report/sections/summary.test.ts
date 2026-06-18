import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { formatUsd } from "@/lib/format/money";
import { SummarySection, summaryStats } from "./summary";
import type { SummarySectionData } from "./types";

// Pure offline test for the farm-summary section (Story 9.1). Two layers:
//  1. `summaryStats` is the value-authoring: we assert the exact grounded strings (counts, the loaded
//     spend through the shared formatUsd, the coverage label when nothing is loaded, the completeness
//     line) without parsing PDF bytes - every number comes from the data argument, never the model.
//  2. We render the section to a real PDF buffer with @react-pdf/renderer (pure JS, no Chromium, no
//     Puppeteer) and assert it is a valid, non-trivial %PDF- byte stream - proving it runs offline.

const base: SummarySectionData = {
  farmName: "Batth Farms",
  totalMeters: 183,
  reconciledMeters: 149,
  coveragePercent: 81,
  loadedSpendCents: 1172733,
};

function renderToPdf(data: SummarySectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(SummarySection, { data })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("summaryStats", () => {
  it("authors every stat from grounded data: counts verbatim, spend through formatUsd", () => {
    const { stats } = summaryStats(base);
    expect(stats[0]?.value).toBe("183");
    expect(stats[1]?.value).toBe("149");
    // Loaded spend through the SHARED formatUsd, never hand-formatted.
    expect(stats[2]?.value).toBe(formatUsd(1172733));
    expect(stats[2]?.value).toBe("$11,727.33");
  });

  it("shows the coverage label for loaded spend when nothing is loaded, never a fabricated $0", () => {
    const { stats } = summaryStats({ ...base, reconciledMeters: 0, loadedSpendCents: null });
    expect(stats[2]?.value).toBe("No bills loaded yet");
    // Never a fabricated zero figure.
    expect(stats[2]?.value).not.toBe("$0.00");
    expect(stats[2]?.value).not.toMatch(/\$/);
  });

  it("states completeness plainly as a whole-percent", () => {
    expect(summaryStats(base).completeness).toContain("81% complete");
    expect(summaryStats(base).completeness).toContain("149 of 183");
  });

  it("says 100% complete when every meter carries loaded billing", () => {
    const { completeness } = summaryStats({ ...base, totalMeters: 4, reconciledMeters: 4, coveragePercent: 100 });
    expect(completeness).toContain("100% complete");
  });

  it("handles an empty farm with an honest line, no divide-by-zero", () => {
    const { completeness } = summaryStats({
      farmName: "Empty",
      totalMeters: 0,
      reconciledMeters: 0,
      coveragePercent: 0,
      loadedSpendCents: null,
    });
    expect(completeness).toBe("No meters on file yet.");
    expect(completeness).not.toMatch(/NaN|Infinity/);
  });

  it("carries no em dashes or exclamation marks (Almond voice)", () => {
    const { stats, completeness } = summaryStats(base);
    const all = [...stats.map((s) => `${s.label} ${s.value}`), completeness].join("\n");
    expect(all).not.toContain("—");
    expect(all).not.toContain("!");
  });
});

describe("SummarySection (offline PDF render)", () => {
  it("renders to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(base);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // A real PDF starts with the %PDF- magic.
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the not-loaded case (null spend) without throwing", async () => {
    const bytes = await renderToPdf({ ...base, reconciledMeters: 0, loadedSpendCents: null });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
