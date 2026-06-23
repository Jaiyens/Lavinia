import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { analyzeFarm } from "@/lib/almond/analysis";
import type { ExportCoverageState } from "./load";
import { buildAnalystMetersWorkbook } from "./xlsx";

// Pure offline test (no Prisma): we build MeterView[] + FindingView[] directly, run the REAL pure
// analysis (analyzeFarm), build the REAL analyst workbook through exceljs, then LOAD the bytes back
// to read cells and number formats. This proves the headline T3a fix - dollar cells are REAL numeric
// currency cells, never string dollars - plus the multi-sheet shape (Summary / Meters /
// Opportunities), frozen panes, AutoFilter, the no-truncation rule, and that the largest-savings
// meter leads the Opportunities sheet. exceljs is pure JS, so this needs no DB and runs in CI.
//
// The fixture mirrors the verified Batth ground truth (.night/GROUND-TRUTH.md) in shape, scaled
// down: Westside Pump 17 is the most expensive meter AND the largest rate-switch opportunity.

function meter(
  over: Partial<MeterView> & { id: string; coverageState: CoverageState },
): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AG-B",
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
  tariff: "AG-B",
  lineItems: [],
});

function finding(
  over: Partial<FindingView> & { id: string; meterId: string },
): FindingView {
  return {
    tool: "rate-optimization",
    situation: "",
    actionLabel: "Move it to AG-C",
    impactUsd: null,
    impactNote: null,
    severity: "act",
    status: "pending",
    meterName: null,
    rateSwitchTo: null,
    rateSwitchFrom: null,
    resultNote: null,
    ...over,
  };
}

function state(meters: MeterView[]): ExportCoverageState {
  const reconciled = meters.filter((m) => m.coverageState === "reconciled").length;
  const needsReview = meters.filter((m) => m.coverageState === "needs_review").length;
  const noBill = meters.filter((m) => m.coverageState === "no_bill").length;
  return {
    coverage: { total: meters.length, reconciled, needsReview, noBill },
    asOf: "2026-03-12T00:00:00.000Z",
  };
}

/** A small fixture: 3 meters, Westside Pump 17 the costliest + largest opportunity, plus a smaller
 *  opportunity, plus an unreconciled meter (its dollar cells must be numeric-empty, never a number). */
function fixture(): { meters: MeterView[]; findings: FindingView[] } {
  const meters = [
    meter({
      id: "Westside Pump 17",
      coverageState: "reconciled",
      entityName: "Batth Farms LLC",
      ranchName: "Westside",
      rateSchedule: "AG-B",
      periods: [period(1_732_700, 93_700)],
    }),
    meter({
      id: "Lateral 3 Booster",
      coverageState: "reconciled",
      entityName: "Batth Farms LLC",
      ranchName: "Lateral 3",
      rateSchedule: "AG-C",
      periods: [period(757_100, 12_000)],
    }),
    meter({
      id: "No Bill Well",
      coverageState: "no_bill",
      entityName: "Batth Farms LLC",
      ranchName: "Home",
      rateSchedule: "AG-A1",
      periods: [],
    }),
  ];
  const findings = [
    finding({
      id: "f1",
      meterId: "Westside Pump 17",
      impactUsd: 61_417.76,
      rateSwitchFrom: "AG-B",
      rateSwitchTo: "AG-C",
    }),
    finding({
      id: "f2",
      meterId: "Lateral 3 Booster",
      impactUsd: 6_825.88,
      rateSwitchFrom: "AG-C",
      rateSwitchTo: "AG-B",
    }),
  ];
  return { meters, findings };
}

async function load(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

/** Every value in a worksheet, flattened, for "no string-dollar cell" scans. */
function allValues(sheet: ExcelJS.Worksheet): ExcelJS.CellValue[] {
  const out: ExcelJS.CellValue[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => out.push(cell.value));
  });
  return out;
}

/** The conditional-format rule types on a worksheet (exceljs exposes `conditionalFormattings` at
 *  runtime but omits it from the published type, so we read it through an unknown cast). */
function cfRuleTypes(sheet: ExcelJS.Worksheet): string[] {
  const cf = (sheet as unknown as { conditionalFormattings: Array<{ rules: Array<{ type: string }> }> })
    .conditionalFormattings;
  return cf.flatMap((f) => f.rules.map((r) => r.type));
}

async function build(): Promise<ExcelJS.Workbook> {
  const { meters, findings } = fixture();
  const analysis = analyzeFarm(meters, findings);
  const bytes = await buildAnalystMetersWorkbook(analysis, state(meters), "Batth Farms");
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes.byteLength).toBeGreaterThan(1000);
  return load(bytes);
}

describe("buildAnalystMetersWorkbook (the analyst meter workbook)", () => {
  it("has at least the three named sheets Summary, Meters, Opportunities", async () => {
    const wb = await build();
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain("Summary");
    expect(names).toContain("Meters");
    expect(names).toContain("Opportunities");
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(3);
    // Summary is the first sheet.
    expect(wb.worksheets[0]?.name).toBe("Summary");
  });

  it("writes REAL numeric currency cells in the Meters sheet (no string dollars anywhere)", async () => {
    const wb = await build();
    const meters = wb.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    // Find the Westside row (col A) and assert its This-cycle (E) and Demand (F) cells are numbers
    // with a currency numFmt, not strings.
    let found = false;
    meters.eachRow({ includeEmpty: false }, (row) => {
      if (row.getCell(1).value === "Westside Pump 17") {
        const cost = row.getCell(5);
        const demand = row.getCell(6);
        expect(cost.type).toBe(ExcelJS.ValueType.Number);
        expect(demand.type).toBe(ExcelJS.ValueType.Number);
        expect(cost.value).toBeCloseTo(17_327.0, 2);
        expect(typeof cost.numFmt).toBe("string");
        expect(cost.numFmt).toMatch(/\$#,##0\.00/);
        expect(demand.numFmt).toMatch(/\$#,##0\.00/);
        found = true;
      }
    });
    expect(found).toBe(true);

    // No cell ANYWHERE in any sheet is a string that looks like a dollar amount ("$1,234..."). The
    // dollars are stored as numbers; "$" only appears inside numFmt strings, never as a cell value.
    for (const sheet of wb.worksheets) {
      for (const value of allValues(sheet)) {
        if (typeof value === "string") {
          expect(value).not.toMatch(/^\$[\d,]/);
        }
      }
    }
  });

  it("leaves an unreconciled meter's dollar cells numeric-empty (never $0, never a string)", async () => {
    const wb = await build();
    const meters = wb.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    let checked = false;
    meters.eachRow({ includeEmpty: false }, (row) => {
      if (row.getCell(1).value === "No Bill Well") {
        const cost = row.getCell(5);
        const demand = row.getCell(6);
        // Numeric-empty: not a Number, and certainly not 0 or a string dollar.
        expect(cost.type).not.toBe(ExcelJS.ValueType.Number);
        expect(cost.value).not.toBe(0);
        expect(demand.value).not.toBe(0);
        // Its coverage cell states why the dollars are blank.
        expect(row.getCell(7).value).toBe("No bill yet");
        checked = true;
      }
    });
    expect(checked).toBe(true);
  });

  it("freezes the Meters header and the meter-name column and sets an AutoFilter", async () => {
    const wb = await build();
    const meters = wb.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    const view = meters.views[0];
    expect(view?.state).toBe("frozen");
    // Header row AND the name column are frozen (xSplit >= 1, ySplit >= 1).
    if (view?.state === "frozen") {
      expect(view.xSplit).toBeGreaterThanOrEqual(1);
      expect(view.ySplit).toBeGreaterThanOrEqual(1);
    }
    expect(meters.autoFilter).toBeTruthy();
  });

  it("default-sorts the Meters rows by This Cycle descending (top row is the answer)", async () => {
    const wb = await build();
    const meters = wb.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    // Row 1 is the header; row 2 is the first data row. Westside Pump 17 (the costliest) leads.
    expect(meters.getRow(2).getCell(1).value).toBe("Westside Pump 17");
  });

  it("Summary carries the spend total as a numeric currency cell matching the analysis", async () => {
    const { meters, findings } = fixture();
    const analysis = analyzeFarm(meters, findings);
    const wb = await load(
      await buildAnalystMetersWorkbook(analysis, state(meters), "Batth Farms"),
    );
    const summary = wb.getWorksheet("Summary");
    if (!summary) throw new Error("Summary sheet missing");
    let spendCell: ExcelJS.Cell | null = null;
    summary.eachRow({ includeEmpty: false }, (row) => {
      if (String(row.getCell(1).value).startsWith("Total spend")) spendCell = row.getCell(2);
    });
    expect(spendCell).not.toBeNull();
    const cell = spendCell as unknown as ExcelJS.Cell;
    expect(cell.type).toBe(ExcelJS.ValueType.Number);
    expect(cell.value).toBeCloseTo(analysis.totals.spendCents / 100, 2);
  });

  it("Opportunities row 1 (below the header) is the largest-savings meter, with data bars", async () => {
    const wb = await build();
    const opps = wb.getWorksheet("Opportunities");
    if (!opps) throw new Error("Opportunities sheet missing");
    // Find the header row, then assert the next row is Westside Pump 17 (the largest opportunity).
    let headerRowNumber = 0;
    opps.eachRow({ includeEmpty: false }, (row) => {
      if (row.getCell(1).value === "Meter" && row.getCell(5).value === "Est. annual savings") {
        headerRowNumber = row.number;
      }
    });
    expect(headerRowNumber).toBeGreaterThan(0);
    const firstData = opps.getRow(headerRowNumber + 1);
    expect(firstData.getCell(1).value).toBe("Westside Pump 17");
    expect(firstData.getCell(4).value).toBe("AG-C"); // suggested rate
    const savings = firstData.getCell(5);
    expect(savings.type).toBe(ExcelJS.ValueType.Number);
    expect(savings.value).toBeCloseTo(61_417.76, 2);
    // A data-bar conditional format is set on the savings column.
    expect(cfRuleTypes(opps)).toContain("dataBar");
  });

  it("the Meters demand-charge column carries a three-color scale", async () => {
    const wb = await build();
    const meters = wb.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    expect(cfRuleTypes(meters)).toContain("colorScale");
  });
});

describe("buildAnalystMetersWorkbook at Batth scale (183 meters): no silent cap", () => {
  it("carries EVERY meter, no truncation at either end", async () => {
    const COUNT = 183;
    const meters = Array.from({ length: COUNT }, (_, i) =>
      meter({
        id: `Pump ${String(i + 1).padStart(3, "0")}`,
        coverageState: "reconciled",
        entityName: "Batth Farms LLC",
        // Ascending cost so the LAST pump is the costliest and must lead the sort, proving no cap at
        // the top, while Pump 001 (cheapest) must still appear, proving no cap at the bottom.
        periods: [period(5_000 + i, 100)],
      }),
    );
    const analysis = analyzeFarm(meters, []);
    const wb = await load(
      await buildAnalystMetersWorkbook(analysis, state(meters), "Batth Farms"),
    );
    const sheet = wb.getWorksheet("Meters");
    if (!sheet) throw new Error("Meters sheet missing");
    const names: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string" && v.startsWith("Pump ")) names.push(v);
    });
    expect(names).toHaveLength(COUNT);
    // Sorted by cost desc: the costliest (Pump 183) leads, and the cheapest (Pump 001) is still present.
    expect(names[0]).toBe("Pump 183");
    expect(names).toContain("Pump 001");
  });
});
