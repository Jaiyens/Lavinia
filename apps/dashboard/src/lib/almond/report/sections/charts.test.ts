import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { ChartsSection, chartGeometry } from "./charts";
import type { ChartBar, ChartsSectionData } from "./types";

// Pure offline test for the charts section (T3b). Charts are NATIVE react-pdf <Svg><Rect> bars (no
// raster, no Chromium): chartGeometry scales each bar against the list's own maximum so the widest bar
// fills the track and the rest read in proportion; an empty / all-zero list yields zero widths (the
// section then draws the honest empty line). Then we render to a real %PDF- buffer.

const bars: ChartBar[] = [
  { label: "Westside Pump 17", value: 203_112, display: "$2,031.12" },
  { label: "Dairy Field Well 3", value: 399_100, display: "$3,991.00" },
];

const data: ChartsSectionData = {
  demandTop: bars,
  spendByEntity: [{ label: "Batth Bros LP", value: 1_732_700, display: "$17,327.00" }],
  rateMix: [
    { label: "AG-C", value: 120, display: "120" },
    { label: "AG-B", value: 63, display: "63" },
  ],
};

function renderToPdf(d: ChartsSectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(ChartsSection, { data: d })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("chartGeometry", () => {
  it("scales the largest bar to the full track and the rest in proportion", () => {
    const geo = chartGeometry(bars);
    // Dairy Field Well 3 (399100) is the largest, so it fills the 240pt track.
    expect(geo[1]?.width).toBe(240);
    // Westside (203112) is ~50.9% of the max, so ~122pt.
    expect(geo[0]?.width).toBe(Math.round((203_112 / 399_100) * 240));
    expect(geo[0]?.width).toBeLessThan(240);
  });

  it("yields zero widths for an all-zero or empty list (the section draws the empty line)", () => {
    expect(chartGeometry([])).toEqual([]);
    const zeros = chartGeometry([{ label: "x", value: 0, display: "0" }]);
    expect(zeros[0]?.width).toBe(0);
  });

  it("never produces a negative width", () => {
    for (const { width } of chartGeometry(bars)) {
      expect(width).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ChartsSection (offline PDF render)", () => {
  it("renders three native bar charts to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders empty charts without throwing (the honest empty-state path)", async () => {
    const bytes = await renderToPdf({ demandTop: [], spendByEntity: [], rateMix: [] });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
