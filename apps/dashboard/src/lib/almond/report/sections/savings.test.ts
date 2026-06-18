import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { formatUsd } from "@/lib/format/money";
import { SavingsSection, savingsView } from "./savings";
import type { SavingsSectionData } from "./types";

// Pure offline test for the savings section (Story 9.1). The view is value-authoring: every money
// figure (per-meter and the summed total) is formatted through the shared formatUsd, never
// hand-formatted; an EMPTY set renders the honest empty line, never a $0 total dressed as a result.
// Then we render to a real PDF buffer (pure JS, no Chromium) and assert a valid %PDF- byte stream.

const data: SavingsSectionData = {
  rows: [
    { meterName: "AG-A1", from: "AG-1A", to: "AG-B", savingsCents: 412300 },
    { meterName: "AG-A2", from: "AG-4B", to: "AG-B", savingsCents: 88700 },
  ],
  totalSavingsCents: 501000,
};

function renderToPdf(d: SavingsSectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(SavingsSection, { data: d })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("savingsView", () => {
  it("formats every per-meter saving through the shared formatUsd", () => {
    const { header, rows } = savingsView(data);
    expect(header).toEqual(["Meter", "Billed on", "Better rate", "Estimated yearly savings"]);
    expect(rows[0]).toEqual(["AG-A1", "AG-1A", "AG-B", formatUsd(412300)]);
    expect(rows[0]?.[3]).toBe("$4,123.00");
    expect(rows[1]?.[3]).toBe(formatUsd(88700));
  });

  it("formats the summed total through formatUsd, never hand-formatted", () => {
    expect(savingsView(data).total).toBe(formatUsd(501000));
    expect(savingsView(data).total).toBe("$5,010.00");
  });

  it("an empty set yields no rows and a zero total (the section renders the honest empty line)", () => {
    const { rows, total } = savingsView({ rows: [], totalSavingsCents: 0 });
    expect(rows).toHaveLength(0);
    expect(total).toBe("$0.00");
  });
});

describe("SavingsSection (offline PDF render)", () => {
  it("renders the savings table to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the EMPTY set without throwing (the honest empty-state path, no $0 result table)", async () => {
    const bytes = await renderToPdf({ rows: [], totalSavingsCents: 0 });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
