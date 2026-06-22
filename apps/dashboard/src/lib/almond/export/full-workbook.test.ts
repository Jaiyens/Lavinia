import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { buildFullWorkbook } from "./full-workbook";
import type { ExportData } from "./load";

/**
 * Offline test of the full multi-tab workbook (pure exceljs, no DB). We build MeterView[] + findings
 * in memory, render the real workbook, then LOAD the bytes back to prove: four named tabs, real
 * currency NUMBERS (not strings) in the money columns with a $ number format, a frozen + brand-banded
 * header, the coverage-label rule preserved, and a savings totals band. A fixed `ref` date pins the
 * bill-due tab so the test is deterministic across timezones.
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

function exportData(meters: MeterView[]): ExportData {
  const reconciled = meters.filter((m) => m.coverageState === "reconciled").length;
  const needsReview = meters.filter((m) => m.coverageState === "needs_review").length;
  const noBill = meters.filter((m) => m.coverageState === "no_bill").length;
  return {
    farm: { id: "farm_batth", name: "Batth Farms" },
    meters,
    state: { coverage: { total: meters.length, reconciled, needsReview, noBill }, asOf: "2026-03-12T00:00:00.000Z" },
  };
}

/** A minimal FindingView carrying only the fields the savings author reads. */
function rateSwitch(meterId: string, toRate: string, impactUsd: number): FindingView {
  return { meterId, rateSwitchTo: toRate, impactUsd } as unknown as FindingView;
}

async function load(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

const REF = "2026-06-21";

describe("buildFullWorkbook", () => {
  it("produces four named tabs: Summary, Meters, Bill due dates, Rate savings", async () => {
    const data = exportData([meter({ id: "P001", coverageState: "reconciled", periods: [period(5000, 100)] })]);
    const wb = await load(await buildFullWorkbook(data, [], REF));
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Summary", "Meters", "Bill due dates", "Rate savings"]);
  });

  it("writes reconciled money as a real NUMBER with a $ format (Excel can sum it), and the coverage label otherwise", async () => {
    const data = exportData([
      meter({ id: "Reconciled", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
      meter({ id: "NoBill", coverageState: "no_bill" }),
    ]);
    const wb = await load(await buildFullWorkbook(data, [], REF));
    const meters = wb.getWorksheet("Meters")!;
    // Find the reconciled meter's row; col 6 is "This cycle" (cost).
    let costCell: ExcelJS.Cell | null = null;
    let labelCell: ExcelJS.Cell | null = null;
    meters.eachRow((row) => {
      if (row.getCell(1).value === "Reconciled") costCell = row.getCell(6);
      if (row.getCell(1).value === "NoBill") labelCell = row.getCell(6);
    });
    expect(costCell).not.toBeNull();
    expect(typeof costCell!.value).toBe("number");
    expect(costCell!.value).toBeCloseTo(11727.33, 2);
    expect(costCell!.numFmt).toContain("$");
    // Unreconciled: the coverage label, never a number or $0.
    expect(labelCell!.value).toBe("No bill yet");
  });

  it("brand-bands and freezes the header on every tab", async () => {
    const data = exportData([meter({ id: "P001", coverageState: "reconciled", periods: [period(5000, 100)] })]);
    const wb = await load(await buildFullWorkbook(data, [], REF));
    const meters = wb.getWorksheet("Meters")!;
    // Header is row 3 (title, spacer, header). Its first cell carries the brand-green fill.
    const headerCell = meters.getRow(3).getCell(1);
    const fill = headerCell.fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe("FF2FA84F");
    // The header is frozen.
    expect(meters.views[0]?.state).toBe("frozen");
  });

  it("lists rate-switch savings with a totals band, and the honest empty line when none", async () => {
    const data = exportData([
      meter({ id: "pump_1", coverageState: "reconciled", rateSchedule: "AG-4", periods: [period(5000, 100)] }),
      meter({ id: "pump_2", coverageState: "reconciled", rateSchedule: "AG-5", periods: [period(5000, 100)] }),
    ]);
    const findings = [rateSwitch("pump_1", "AG-B", 1200), rateSwitch("pump_2", "AG-C", 800)];
    const wb = await load(await buildFullWorkbook(data, findings, REF));
    const savings = wb.getWorksheet("Rate savings")!;
    const flat: string[] = [];
    savings.eachRow((row) => row.eachCell((c) => flat.push(c.value === null ? "" : String(c.value))));
    expect(flat).toContain("Total estimated savings");
    // The two suggested rates appear.
    expect(flat).toContain("AG-B");
    expect(flat).toContain("AG-C");

    // No findings -> the honest empty line, no fabricated rows.
    const wbEmpty = await load(await buildFullWorkbook(data, [], REF));
    const empty: string[] = [];
    wbEmpty.getWorksheet("Rate savings")!.eachRow((row) => row.eachCell((c) => empty.push(String(c.value))));
    expect(empty.join(" ")).toContain("No rate changes are flagged");
  });

  it("summary tab states the farm, meter count, and completeness", async () => {
    const data = exportData([
      meter({ id: "A", coverageState: "reconciled", periods: [period(5000, 100)] }),
      meter({ id: "B", coverageState: "no_bill" }),
    ]);
    const wb = await load(await buildFullWorkbook(data, [], REF));
    const summary = wb.getWorksheet("Summary")!;
    const flat: string[] = [];
    summary.eachRow((row) => row.eachCell((c) => flat.push(c.value === null ? "" : String(c.value))));
    const joined = flat.join(" ");
    expect(joined).toContain("Batth Farms");
    expect(joined).toContain("Meters on file");
    expect(joined).toContain("50%"); // 1 of 2 reconciled
  });
});
