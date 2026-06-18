import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { formatUsd } from "@/lib/format/money";
import { SingleMeterSection, singleMeterFields } from "./single-meter";
import type { SingleMeterSectionData } from "./types";

// Pure offline test for the single-meter section (Story 9.1). The fields are value-authoring: a
// reconciled meter shows real money through the shared formatUsd; an unreconciled meter's money fields
// show the SHARED coverage label (never a number, never $0); a reconciled meter with no demand shows
// "None"; a null inventory field shows "Not on file" (never fabricated). Then we render to a real PDF
// buffer (pure JS, no Chromium) and assert a valid %PDF- byte stream.

const reconciled: SingleMeterSectionData = {
  name: "AG-A1",
  ranch: "North",
  entity: "Batth Bros LP",
  rate: "AG-1A",
  status: "GOOD",
  coverageState: "reconciled",
  costCents: 1172733,
  demandCents: 278322,
};

function fieldValue(data: SingleMeterSectionData, label: string): string | undefined {
  return singleMeterFields(data).find((f) => f.label === label)?.value;
}

function renderToPdf(data: SingleMeterSectionData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, null, createElement(SingleMeterSection, { data })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("singleMeterFields", () => {
  it("shows real money for a reconciled meter through the shared formatUsd", () => {
    expect(fieldValue(reconciled, "This cycle")).toBe(formatUsd(1172733));
    expect(fieldValue(reconciled, "This cycle")).toBe("$11,727.33");
    expect(fieldValue(reconciled, "Demand charge")).toBe("$2,783.22");
  });

  it("shows the SHARED coverage label for an unreconciled meter's money, never a number or $0", () => {
    const needsReview: SingleMeterSectionData = {
      ...reconciled,
      coverageState: "needs_review",
      costCents: null,
      demandCents: null,
    };
    expect(fieldValue(needsReview, "This cycle")).toBe("Needs review");
    expect(fieldValue(needsReview, "Demand charge")).toBe("Needs review");
    expect(fieldValue(needsReview, "This cycle")).not.toMatch(/\$/);

    const noBill: SingleMeterSectionData = { ...needsReview, coverageState: "no_bill" };
    expect(fieldValue(noBill, "This cycle")).toBe("No bill yet");
    expect(fieldValue(noBill, "Demand charge")).toBe("No bill yet");
  });

  it("shows None for a reconciled meter with no demand charge (honest absence)", () => {
    const noDemand: SingleMeterSectionData = { ...reconciled, demandCents: null };
    expect(fieldValue(noDemand, "Demand charge")).toBe("None");
    // Cost still real.
    expect(fieldValue(noDemand, "This cycle")).toBe("$11,727.33");
  });

  it("shows Not on file for a null inventory field, never fabricated", () => {
    const sparse: SingleMeterSectionData = {
      ...reconciled,
      ranch: null,
      entity: null,
      rate: null,
      status: null,
    };
    expect(fieldValue(sparse, "Ranch")).toBe("Not on file");
    expect(fieldValue(sparse, "Billed to")).toBe("Not on file");
    expect(fieldValue(sparse, "Rate")).toBe("Not on file");
    expect(fieldValue(sparse, "Pump health")).toBe("Not on file");
  });

  it("carries no em dashes or exclamation marks (Almond voice)", () => {
    const all = singleMeterFields(reconciled).map((f) => `${f.label} ${f.value}`).join("\n");
    expect(all).not.toContain("—");
    expect(all).not.toContain("!");
  });
});

describe("SingleMeterSection (offline PDF render)", () => {
  it("renders a reconciled meter to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const bytes = await renderToPdf(reconciled);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders an unreconciled meter (coverage labels in money fields) without throwing", async () => {
    const bytes = await renderToPdf({
      ...reconciled,
      coverageState: "no_bill",
      costCents: null,
      demandCents: null,
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
