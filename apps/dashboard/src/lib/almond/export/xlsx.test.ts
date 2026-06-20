import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import type { ExportData } from "./load";
import { buildMetersWorkbook } from "./xlsx";

// Pure offline test (no Prisma): we build MeterView[] directly, run the real exceljs builder, then
// LOAD the bytes back with exceljs to read cells - proving the workbook is a real .xlsx and carries
// every meter, the coverage-label rule, whole-dollar money, and a footer that states what was left
// out. exceljs is pure JS, so this needs no DB and runs in CI.

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
  totalKwh: null,
  peakKw: null,
  tariff: "AGC",
  lineItems: [],
});

function exportData(meters: MeterView[], over: Partial<ExportData["state"]> = {}): ExportData {
  const reconciled = meters.filter((m) => m.coverageState === "reconciled").length;
  const needsReview = meters.filter((m) => m.coverageState === "needs_review").length;
  const noBill = meters.filter((m) => m.coverageState === "no_bill").length;
  return {
    farm: { id: "farm_batth", name: "Batth Farms" },
    meters,
    state: {
      coverage: { total: meters.length, reconciled, needsReview, noBill },
      asOf: "2026-03-12T00:00:00.000Z",
      ...over,
    },
  };
}

/** Read the bytes back into a workbook and return the single sheet's cells as a string grid. */
async function readGrid(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // exceljs reads from an ArrayBuffer-compatible buffer.
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cell.value === null || cell.value === undefined ? "" : String(cell.value));
    });
    grid.push(cells);
  });
  return grid;
}

const HEADER = ["Meter", "Ranch", "Entity", "Rate", "Legacy", "This cycle", "Demand charge", "Status", "Coverage"];

describe("buildMetersWorkbook", () => {
  it("produces a non-trivial .xlsx byte payload (assertable size)", async () => {
    const bytes = await buildMetersWorkbook(exportData([meter({ id: "P001", coverageState: "no_bill" })]));
    expect(bytes).toBeInstanceOf(Uint8Array);
    // A real zipped workbook is well over a kilobyte; assert a concrete lower bound.
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("writes the worksheet name and the plain operator headers", async () => {
    const bytes = await buildMetersWorkbook(exportData([meter({ id: "P001", coverageState: "no_bill" })]));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets[0]?.name).toBe("Meters");
    const grid = await readGrid(bytes);
    // Title row, spacer, then the header row.
    expect(grid[0]?.[0]).toBe("Batth Farms meters");
    expect(grid[2]).toEqual(HEADER);
  });

  it("at Batth scale (183 meters) contains EVERY meter, no silent cap", async () => {
    const COUNT = 183;
    const meters = Array.from({ length: COUNT }, (_, i) =>
      meter({
        id: `Pump ${String(i + 1).padStart(3, "0")}`,
        coverageState: "reconciled",
        periods: [period(5000 + i, 100)],
      }),
    );
    const bytes = await buildMetersWorkbook(exportData(meters));
    const grid = await readGrid(bytes);
    // Data rows live between the header (row index 2) and the two footer lines + a blank.
    const meterNames = grid
      .map((r) => r[0])
      .filter((name) => name !== undefined && name.startsWith("Pump "));
    expect(meterNames).toHaveLength(COUNT);
    // First and last meter both made it (no truncation at either end).
    expect(meterNames[0]).toBe("Pump 001");
    expect(meterNames[COUNT - 1]).toBe("Pump 183");
  });

  it("at Batth scale the file is non-trivial and generates promptly", async () => {
    const meters = Array.from({ length: 183 }, (_, i) =>
      meter({ id: `Pump ${String(i + 1).padStart(3, "0")}`, coverageState: "reconciled", periods: [period(5000, 100)] }),
    );
    const start = Date.now();
    const bytes = await buildMetersWorkbook(exportData(meters));
    const elapsed = Date.now() - start;
    expect(bytes.byteLength).toBeGreaterThan(2000);
    // Generous offline bound: 183 meters must serialize fast, not stall.
    expect(elapsed).toBeLessThan(5000);
  });

  it("shows the coverage label for an unreconciled meter, never a fabricated or zero figure", async () => {
    const meters = [
      meter({ id: "Reconciled", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
      meter({ id: "NeedsReview", coverageState: "needs_review", periods: [period(5000, 100)] }),
      meter({ id: "NoBill", coverageState: "no_bill" }),
    ];
    const grid = await readGrid(await buildMetersWorkbook(exportData(meters)));
    const byName = (name: string) => grid.find((r) => r[0] === name);
    // Reconciled: real whole-dollar money via the shared formatUsd.
    expect(byName("Reconciled")?.[5]).toBe("$11,727.33");
    expect(byName("Reconciled")?.[6]).toBe("$2,783.22");
    // Unreconciled: the coverage label in BOTH money cells, never a number or $0.
    expect(byName("NeedsReview")?.[5]).toBe("Needs review");
    expect(byName("NeedsReview")?.[6]).toBe("Needs review");
    expect(byName("NoBill")?.[5]).toBe("No bill yet");
    expect(byName("NoBill")?.[6]).toBe("No bill yet");
  });

  it("states what was left out in the footer (coverage + as-of), no silent truncation", async () => {
    const meters = [
      meter({ id: "A", coverageState: "reconciled", periods: [period(5000, 100)] }),
      meter({ id: "B", coverageState: "no_bill" }),
      meter({ id: "C", coverageState: "needs_review" }),
    ];
    const grid = await readGrid(await buildMetersWorkbook(exportData(meters)));
    const flat = grid.map((r) => r.join(" ")).join("\n");
    // Coverage footer: every meter included, and how many carry loaded billing.
    expect(flat).toContain("All 3 meters included");
    expect(flat).toContain("1 have loaded billing");
    // As-of: the freshest billed cycle, formatted as a plain date.
    expect(flat).toContain("Figures as of the bill closing March 12, 2026");
  });

  it("states honest absence when no bill has posted (asOf null), never a fabricated date", async () => {
    const meters = [meter({ id: "A", coverageState: "no_bill" }), meter({ id: "B", coverageState: "no_bill" })];
    const grid = await readGrid(await buildMetersWorkbook(exportData(meters, { asOf: null })));
    const flat = grid.map((r) => r.join(" ")).join("\n");
    expect(flat).toContain("All 2 meters included");
    expect(flat).toContain("No bills have posted yet");
    // No invented date.
    expect(flat).not.toMatch(/as of the bill closing/);
  });
});
