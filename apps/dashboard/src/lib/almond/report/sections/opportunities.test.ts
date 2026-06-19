import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { formatUsd } from "@/lib/format/money";
import { OpportunitiesSection, opportunitiesView } from "./opportunities";
import type { OpportunitiesSectionData } from "./types";

// Pure offline test for the opportunities section (T3b): the money-first lead. The view is
// value-authoring: every per-meter saving and the summed total format through the shared formatUsd
// (never hand-formatted); the lead states the count and the total; an EMPTY set yields the honest empty
// line, NOT a "No rate savings found" lead. The four-row seed case is asserted end to end in the
// generate-report.db.test.ts; here we prove the authoring against fixtures.

const data: OpportunitiesSectionData = {
  rows: [
    { meterName: "Westside Pump 17", currentRate: "AG-B", suggestedRate: "AG-C", savingsCents: 6_141_776 },
    { meterName: "Lateral 3 Booster", currentRate: "AG-C", suggestedRate: "AG-B", savingsCents: 682_588 },
  ],
  totalSavingsCents: 6_824_364,
};

function renderToPdf(d: OpportunitiesSectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(OpportunitiesSection, { data: d })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("opportunitiesView", () => {
  it("ranks the rate switches most-savings-first with their current and suggested rate", () => {
    const { header, rows } = opportunitiesView(data);
    expect(header).toEqual(["Meter", "Billed on", "Better rate", "Estimated yearly savings"]);
    expect(rows[0]).toEqual(["Westside Pump 17", "AG-B", "AG-C", formatUsd(6_141_776)]);
    expect(rows[0]?.[3]).toBe("$61,417.76");
    expect(rows[1]?.[0]).toBe("Lateral 3 Booster");
  });

  it("states the count and the summed total in the lead, through formatUsd", () => {
    const { lead, total } = opportunitiesView(data);
    expect(total).toBe(formatUsd(6_824_364));
    expect(lead).toContain("2 rate changes");
    expect(lead).toContain(total);
  });

  it("uses the singular lead for a single opportunity", () => {
    const single = opportunitiesView({ rows: [data.rows[0]!], totalSavingsCents: 6_141_776 });
    expect(single.lead).toContain("One rate change");
  });

  it("an empty set yields no rows and a null lead (the section renders the honest empty line)", () => {
    const view = opportunitiesView({ rows: [], totalSavingsCents: 0 });
    expect(view.rows).toHaveLength(0);
    expect(view.lead).toBeNull();
    // The empty line must NOT be the old "No rate savings found" lead; the section copy owns it.
    expect(view.total).toBe("$0.00");
  });

  it("carries no em dashes (Almond voice)", () => {
    const { lead } = opportunitiesView(data);
    expect(lead ?? "").not.toContain("—");
  });
});

describe("OpportunitiesSection (offline PDF render)", () => {
  it("renders the ranked table to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the EMPTY set without throwing (the honest empty path, never a fake $0 table)", async () => {
    const bytes = await renderToPdf({ rows: [], totalSavingsCents: 0 });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
