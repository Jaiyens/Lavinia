import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { formatUsd } from "@/lib/format/money";
import { CoverSection, coverView } from "./cover";
import type { CoverSectionData } from "./types";

// Pure offline test for the cover section (T3b). The view is value-authoring: the hero line names the
// biggest opportunity meter and its yearly dollars (through the shared formatUsd, never hand-formatted),
// the rate move when it is a switch, and the two supporting totals; a null opportunity yields the
// honest heroNone line (never an invented hero). Then we render to a real %PDF- buffer (pure JS, no
// Chromium). The seed-grounded numbers (Westside Pump 17, $61,417.76) are asserted end to end in the
// generate-report.db.test.ts; here we prove the authoring against fixtures.

const rateSwitch: CoverSectionData = {
  farmName: "Batth Farms",
  asOf: "March 12, 2026",
  hero: {
    meterName: "Westside Pump 17",
    amountCents: 6_141_776,
    currentRate: "AG-B",
    suggestedRate: "AG-C",
    isRateSwitch: true,
  },
  totalSpendCents: 1_732_700,
  totalDemandCents: 93_700,
};

function renderToPdf(data: CoverSectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(CoverSection, { data })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("coverView", () => {
  it("leads with the biggest opportunity: the meter name and the yearly dollars through formatUsd", () => {
    const { hero } = coverView(rateSwitch);
    expect(hero).toContain("Westside Pump 17");
    expect(hero).toContain(formatUsd(6_141_776));
    expect(hero).toContain("$61,417.76");
  });

  it("names the rate move when the biggest opportunity is a rate switch", () => {
    expect(coverView(rateSwitch).heroDetail).toBe("Move it from AG-B to AG-C.");
  });

  it("states the as-of date and both supporting totals through formatUsd", () => {
    const { asOf, stats } = coverView(rateSwitch);
    expect(asOf).toBe("Figures as of March 12, 2026.");
    expect(stats[0]?.value).toBe(formatUsd(1_732_700));
    expect(stats[1]?.value).toBe(formatUsd(93_700));
  });

  it("falls back to the target-only rate move when the current rate is unknown", () => {
    const view = coverView({
      ...rateSwitch,
      hero: { ...rateSwitch.hero!, currentRate: null },
    });
    expect(view.heroDetail).toBe("Move it to AG-C.");
  });

  it("frames a non-rate-switch dollar finding as money worth a look (no fabricated rate move)", () => {
    const view = coverView({
      ...rateSwitch,
      hero: {
        meterName: "Westside Pump 17",
        amountCents: 203_112,
        currentRate: null,
        suggestedRate: null,
        isRateSwitch: false,
      },
    });
    expect(view.hero).toContain("Westside Pump 17");
    expect(view.hero).toContain("$2,031.12");
    expect(view.heroDetail).toBeNull();
  });

  it("states no opportunity plainly when the analysis has none, never an invented hero", () => {
    const view = coverView({ ...rateSwitch, hero: null });
    expect(view.hero).toBe("No dollar opportunities are flagged in the data on file.");
    expect(view.heroDetail).toBeNull();
    expect(view.hero).not.toMatch(/\$/);
  });

  it("shows the coverage labels (never a fabricated $0) when the farm has no loaded spend or demand", () => {
    const view = coverView({ ...rateSwitch, totalSpendCents: null, totalDemandCents: null });
    expect(view.stats[0]?.value).toBe("No bills loaded yet");
    expect(view.stats[1]?.value).toBe("None on file");
    expect(view.asOf).toBe("Figures as of March 12, 2026.");
  });

  it("states the as-of absence honestly when no bill has posted", () => {
    expect(coverView({ ...rateSwitch, asOf: null }).asOf).toBe(
      "No bills have posted yet, so this report carries no dated figures.",
    );
  });

  it("carries no em dashes or exclamation marks (Almond voice)", () => {
    const { asOf, hero, heroDetail, stats } = coverView(rateSwitch);
    const all = [asOf, hero, heroDetail ?? "", ...stats.map((s) => `${s.label} ${s.value}`)].join("\n");
    expect(all).not.toContain("—");
    expect(all).not.toContain("!");
  });
});

describe("CoverSection (offline PDF render)", () => {
  it("renders the cover to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(rateSwitch);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the no-opportunity cover without throwing (the honest empty-hero path)", async () => {
    const bytes = await renderToPdf({ ...rateSwitch, hero: null, totalSpendCents: null, totalDemandCents: null, asOf: null });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
