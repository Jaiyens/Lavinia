import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import type { ExportData } from "@/lib/almond/export/load";
import { MeterTableSection, meterTableGrid } from "./meter-table";

// Pure offline test for the meter-table section (Story 9.1). It must NOT define a parallel table: the
// grid comes from the shipped header/cell builder, so we assert the SAME operator headers, that every
// meter is listed (no cap), the coverage-label rule (an unreconciled meter's money cells are the
// label, never a number), and real whole-dollar money for a reconciled meter. Then we render to a
// real PDF buffer (pure JS, no Chromium) and assert a valid %PDF- byte stream.

function meter(over: Partial<MeterView> & { id: string; coverageState: CoverageState }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
    cropName: null,
    latitude: null,
    longitude: null,
    gpm: null,
    isSolar: false,
    nemType: null,
    trueUpMonth: null,
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: null,
    benefitingArrays: [],
    growerPumpId: null,
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

const period = (totalCents: number | null, demandCents: number | null) => ({
  start: "2026-02-11T00:00:00.000Z",
  close: "2026-03-12T00:00:00.000Z",
  printedTotalCents: totalCents,
  demandCents,
  peakKw: null,
  tariff: "AGC",
  lineItems: [],
});

function exportData(meters: MeterView[]): ExportData {
  const reconciled = meters.filter((m) => m.coverageState === "reconciled").length;
  const needsReview = meters.filter((m) => m.coverageState === "needs_review").length;
  const noBill = meters.filter((m) => m.coverageState === "no_bill").length;
  return {
    farm: { id: "farm_batth", name: "Batth Farms" },
    meters,
    state: {
      coverage: { total: meters.length, reconciled, needsReview, noBill },
      asOf: "2026-03-12T00:00:00.000Z",
    },
  };
}

const HEADER = ["Meter", "Ranch", "Entity", "Rate", "Legacy", "This cycle", "Demand charge", "Status", "Coverage"];

function renderToPdf(data: ExportData): Promise<Uint8Array> {
  const doc = createElement(
    Document,
    null,
    createElement(Page, { orientation: "landscape" }, createElement(MeterTableSection, { data })),
  );
  return renderToBuffer(doc) as unknown as Promise<Uint8Array>;
}

describe("meterTableGrid", () => {
  it("uses the SAME operator headers as the spreadsheet export (one header definition)", () => {
    const { header } = meterTableGrid(exportData([meter({ id: "P001", coverageState: "no_bill" })]));
    expect(header).toEqual(HEADER);
  });

  it("lists EVERY meter, no silent cap (183 at Batth scale)", () => {
    const COUNT = 183;
    const meters = Array.from({ length: COUNT }, (_, i) =>
      meter({ id: `Pump ${String(i + 1).padStart(3, "0")}`, coverageState: "reconciled", periods: [period(5000 + i, 100)] }),
    );
    const { rows } = meterTableGrid(exportData(meters));
    expect(rows).toHaveLength(COUNT);
    expect(rows[0]?.cells[0]).toBe("Pump 001");
    expect(rows[COUNT - 1]?.cells[0]).toBe("Pump 183");
  });

  it("shows real whole-dollar money for a reconciled meter and the coverage label otherwise", () => {
    const meters = [
      meter({ id: "Reconciled", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
      meter({ id: "NeedsReview", coverageState: "needs_review", periods: [period(5000, 100)] }),
      meter({ id: "NoBill", coverageState: "no_bill" }),
    ];
    const { rows } = meterTableGrid(exportData(meters));
    const byName = (name: string) => rows.find((r) => r.cells[0] === name)?.cells;
    // Reconciled: real money via the shared formatUsd (cost col 5, demand col 6).
    expect(byName("Reconciled")?.[5]).toBe("$11,727.33");
    expect(byName("Reconciled")?.[6]).toBe("$2,783.22");
    // Unreconciled: the coverage label in both money cells, never a number or $0.
    expect(byName("NeedsReview")?.[5]).toBe("Needs review");
    expect(byName("NeedsReview")?.[6]).toBe("Needs review");
    expect(byName("NoBill")?.[5]).toBe("No bill yet");
    expect(byName("NoBill")?.[6]).toBe("No bill yet");
  });
});

describe("MeterTableSection (offline PDF render)", () => {
  it("renders to a valid, non-trivial %PDF- byte stream with no Chromium", async () => {
    const meters = [
      meter({ id: "Reconciled", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
      meter({ id: "NoBill", coverageState: "no_bill" }),
    ];
    const bytes = await renderToPdf(exportData(meters));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders the full Batth-scale inventory without throwing or stalling", async () => {
    const meters = Array.from({ length: 183 }, (_, i) =>
      meter({ id: `Pump ${String(i + 1).padStart(3, "0")}`, coverageState: "reconciled", periods: [period(5000, 100)] }),
    );
    const start = Date.now();
    const bytes = await renderToPdf(exportData(meters));
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Date.now() - start).toBeLessThan(15000);
  });
});
