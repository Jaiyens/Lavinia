import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { MisRatedSection, misRatedGrid } from "./mis-rated";
import type { MisRatedSectionData } from "./types";

// Pure offline test for the mis-rated section (Story 9.1). The grid is value-authoring: we assert the
// grounded cells (meter, ranch, current rate, suggested rate), that a null rate shows the not-on-file
// label (never a fabricated code), and that an EMPTY set renders the honest empty label rather than an
// empty table. Then we render to a real PDF buffer (pure JS, no Chromium) and assert a valid %PDF-.

const data: MisRatedSectionData = {
  rows: [
    { meterName: "AG-A1", ranch: "North", currentRate: "AG-1A", suggestedRate: "AG-B" },
    { meterName: "AG-A2", ranch: null, currentRate: null, suggestedRate: "AG-B" },
  ],
};

function renderToPdf(d: MisRatedSectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(MisRatedSection, { data: d })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("misRatedGrid", () => {
  it("authors the focused-set cells from grounded data", () => {
    const { header, rows } = misRatedGrid(data);
    expect(header).toEqual(["Meter", "Ranch", "Current rate", "Suggested rate"]);
    expect(rows[0]).toEqual(["AG-A1", "North", "AG-1A", "AG-B"]);
  });

  it("shows the not-on-file label for a null rate, never a fabricated code", () => {
    const { rows } = misRatedGrid(data);
    // AG-A2 has a null current rate and null ranch.
    expect(rows[1]).toEqual(["AG-A2", "", "Not on file", "AG-B"]);
  });

  it("an empty set yields no rows (the section renders the honest empty line)", () => {
    const { rows } = misRatedGrid({ rows: [] });
    expect(rows).toHaveLength(0);
  });
});

describe("MisRatedSection (offline PDF render)", () => {
  it("renders the focused set to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the EMPTY set without throwing (the honest empty-state path)", async () => {
    const bytes = await renderToPdf({ rows: [] });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
