import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import { toMeterRow } from "@/lib/dashboard/table";
import { metersCsv } from "@/lib/dashboard/csv";
import type { ExportData } from "./load";
import { meterRowsForExport, exportMetersCsv } from "./rows";

// Pure offline test (no Prisma, no I/O): the adapter is the single mapping point from an export's
// MeterView[] to the table-shaped MeterRow[], and exportMetersCsv must REUSE the shipped metersCsv
// verbatim (no parallel CSV format). We build MeterView[] directly and assert byte-identity with
// metersCsv over the same rows, plus the coverage-label rule for an unreconciled meter.

function meter(
  over: Partial<MeterView> & { id: string; coverageState: CoverageState },
): MeterView {
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

function exportData(meters: MeterView[], over: Partial<ExportData["state"]> = {}): ExportData {
  const reconciled = meters.filter((m) => m.coverageState === "reconciled").length;
  const needsReview = meters.filter((m) => m.coverageState === "needs_review").length;
  const noBill = meters.filter((m) => m.coverageState === "no_bill").length;
  return {
    farm: { id: "farm_1", name: "Batth Farms" },
    meters,
    state: {
      coverage: { total: meters.length, reconciled, needsReview, noBill },
      asOf: "2026-03-12T00:00:00.000Z",
      ...over,
    },
  };
}

describe("meterRowsForExport (single mapping point)", () => {
  it("maps EVERY meter through the shipped toMeterRow, in loader order, with no cap", () => {
    const meters = [
      meter({ id: "P003", coverageState: "no_bill" }),
      meter({ id: "P001", coverageState: "reconciled", periods: [period(5000, 200)] }),
      meter({ id: "P002", coverageState: "needs_review" }),
    ];
    const rows = meterRowsForExport(exportData(meters));
    // Same count (no truncation) and same order the loader handed us.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(["P003", "P001", "P002"]);
    // It IS the shipped projection: each row equals toMeterRow of its meter (carries coverage,
    // cost/demand gated on AR-15), not a re-derived parallel shape.
    expect(rows).toEqual(meters.map(toMeterRow));
  });
});

describe("exportMetersCsv (reuses metersCsv, no parallel format)", () => {
  it("is byte-identical to metersCsv over the mapped rows", () => {
    const meters = [
      meter({ id: "P002", coverageState: "reconciled", periods: [period(-14911, null)] }),
      meter({ id: "P054", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
      meter({ id: "P099", coverageState: "no_bill" }),
    ];
    const data = exportData(meters);
    // The adapter must not introduce its own CSV: its output equals metersCsv of the same rows.
    expect(exportMetersCsv(data)).toBe(metersCsv(meterRowsForExport(data)));
  });

  it("keeps the metersCsv BOM, CRLF and the nine operator headers", () => {
    const csv = exportMetersCsv(exportData([]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    const header = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(header).toBe(
      "Meter,Ranch,Entity,Rate,Legacy,This cycle,Demand charge,Status,Coverage",
    );
  });

  it("shows the coverage label (never a number) for an unreconciled meter's money cells", () => {
    const meters = [
      meter({ id: "needs", coverageState: "needs_review", periods: [period(5000, 100)] }),
      meter({ id: "none", coverageState: "no_bill" }),
    ];
    const csv = exportMetersCsv(exportData(meters));
    const body = csv.replace(/^﻿/, "").split("\r\n");
    const needsCells = body[1]?.split(",");
    const noneCells = body[2]?.split(",");
    expect(needsCells?.[5]).toBe("Needs review"); // cost cell carries the label, not $50.00
    expect(needsCells?.[6]).toBe("Needs review"); // demand cell too
    expect(noneCells?.[5]).toBe("No bill yet");
    // Never fabricate the withheld figures.
    expect(csv).not.toContain("$50.00");
    expect(csv).not.toContain("$1.00");
  });

  it("exports a reconciled meter's real whole-figure money, formatted via the shared formatUsd", () => {
    const meters = [
      meter({ id: "P054", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
    ];
    const csv = exportMetersCsv(exportData(meters));
    expect(csv).toContain('"$11,727.33"');
    expect(csv).toContain('"$2,783.22"');
  });
});
