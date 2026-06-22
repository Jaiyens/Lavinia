import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import { meterCells } from "@/lib/dashboard/csv";
import { toMeterRow } from "@/lib/dashboard/table";
import { meterCellsTyped } from "./cells";
import { cellText } from "./workbook";

/**
 * The parity law: the typed workbook cells must render EXACTLY the same content as the shared CSV
 * string cells (src/lib/dashboard/csv.ts), so the styled .xlsx and the CSV/legacy export can never
 * drift. We prove `meterCellsTyped(row).map(cellText)` deep-equals `meterCells(row)` across the
 * coverage states, and separately that a reconciled money cell is a REAL number (so Excel can format
 * and sum it) while an unreconciled one stays the coverage label (never a fabricated figure).
 */

function meter(over: Partial<MeterView> & { id: string; coverageState: CoverageState }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AG-A1",
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
  totalKwh: null,
  peakKw: null,
  tariff: "AG-A1",
  lineItems: [],
});

describe("meterCellsTyped parity with meterCells", () => {
  const cases: MeterView[] = [
    meter({ id: "Reconciled", coverageState: "reconciled", isLegacy: true, status: "OK", periods: [period(1172733, 278322)] }),
    meter({ id: "ReconNoDemand", coverageState: "reconciled", periods: [period(5000, null)] }),
    meter({ id: "NeedsReview", coverageState: "needs_review", periods: [period(5000, 100)] }),
    meter({ id: "NoBill", coverageState: "no_bill" }),
  ];

  it("renders identical content to the CSV string cells across coverage states", () => {
    for (const m of cases) {
      const row = toMeterRow(m);
      expect(meterCellsTyped(row).map(cellText)).toEqual(meterCells(row));
    }
  });

  it("carries a reconciled money figure as a real number, not a string", () => {
    const row = toMeterRow(meter({ id: "R", coverageState: "reconciled", periods: [period(1172733, 278322)] }));
    const cells = meterCellsTyped(row);
    // Cost (index 5) and demand (index 6) are real numbers in dollars with the currency format.
    expect(cells[5]).toEqual({ value: 11727.33, format: "currency" });
    expect(cells[6]).toEqual({ value: 2783.22, format: "currency" });
    // cellText reproduces the CSV's exact "$X,XXX.XX".
    expect(cellText(cells[5]!)).toBe("$11,727.33");
  });

  it("keeps an unreconciled meter's money cell as the coverage label, never a number", () => {
    const cells = meterCellsTyped(toMeterRow(meter({ id: "N", coverageState: "needs_review" })));
    expect(cells[5]).toEqual({ value: "Needs review", format: "label" });
    expect(typeof cells[5]!.value).toBe("string");
  });
});
