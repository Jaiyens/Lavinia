import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { runEngines } from "@/lib/recommendations/run";
import { analyzeFarm } from "@/lib/almond/analysis";
import { seedBatthFarm } from "../../../../prisma/batth-farm";
import { summarizeExportState } from "./load";
import { buildAnalystMetersWorkbook } from "./xlsx";

// Integration test for the analyst meter workbook over the REAL Batth seed (.night/GROUND-TRUTH.md).
// Seeds the representative farm, runs every recommendation engine, loads the same meters + findings
// the dashboard reads, builds the workbook from analyzeFarm, then LOADS the bytes back with exceljs
// and asserts the structural truths the spec requires: three sheets, real numeric currency (never
// string dollars), frozen + AutoFilter, the spend total matches the analysis, the largest-savings
// meter (Westside Pump 17) leads Opportunities, and all 183 meters survive. This is the strongest
// proof that the file can never contradict the dashboard. Throwaway Postgres; never dev.db. Not run
// in the offline overnight pass (local Postgres unavailable); runs in CI / locally with the cluster.

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;
let bytes: Uint8Array;
let workbook: ExcelJS.Workbook;
let spendCents: number;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const seeded = await seedBatthFarm(prisma);
  farmId = seeded.id;
  await runEngines(prisma, farmId);

  const [meters, findings] = await Promise.all([
    loadMetersForFarm(prisma, farmId),
    loadFindings(prisma, farmId),
  ]);
  const analysis = analyzeFarm(meters, findings);
  spendCents = analysis.totals.spendCents;
  bytes = await buildAnalystMetersWorkbook(analysis, summarizeExportState(meters), "Batth Farms");

  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

/** The conditional-format rule types on a worksheet (exceljs omits the property from its type). */
function cfRuleTypes(sheet: ExcelJS.Worksheet): string[] {
  const cf = (sheet as unknown as { conditionalFormattings: Array<{ rules: Array<{ type: string }> }> })
    .conditionalFormattings;
  return cf.flatMap((f) => f.rules.map((r) => r.type));
}

describe("buildAnalystMetersWorkbook over the real Batth seed", () => {
  it("has the three named sheets, Summary first", () => {
    const names = workbook.worksheets.map((w) => w.name);
    expect(names).toContain("Summary");
    expect(names).toContain("Meters");
    expect(names).toContain("Opportunities");
    expect(workbook.worksheets[0]?.name).toBe("Summary");
  });

  it("Meters dollar cells are REAL numbers with a currency format, and no string-dollar cell exists", () => {
    const meters = workbook.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    // The top data row (row 2) is Westside Pump 17 (rankingsByCost[0]); its This-cycle cell (col E)
    // is a number with a currency numFmt, never a string.
    const topRow = meters.getRow(2);
    expect(topRow.getCell(1).value).toBe("Westside Pump 17");
    const cost = topRow.getCell(5);
    expect(cost.type).toBe(ExcelJS.ValueType.Number);
    expect(cost.numFmt).toMatch(/\$#,##0\.00/);

    // No cell ANYWHERE is a string that looks like a dollar amount.
    for (const sheet of workbook.worksheets) {
      sheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (typeof cell.value === "string") {
            expect(cell.value).not.toMatch(/^\$[\d,]/);
          }
        });
      });
    }
  });

  it("freezes the Meters header + name column, AutoFilters, and color-scales the demand column", () => {
    const meters = workbook.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    expect(meters.views[0]?.state).toBe("frozen");
    expect(meters.autoFilter).toBeTruthy();
    expect(cfRuleTypes(meters)).toContain("colorScale");
  });

  it("Summary carries the spend total as a numeric cell matching analysis.totals.spendCents/100", () => {
    const summary = workbook.getWorksheet("Summary");
    if (!summary) throw new Error("Summary sheet missing");
    let spendCell: ExcelJS.Cell | null = null;
    summary.eachRow({ includeEmpty: false }, (row) => {
      if (String(row.getCell(1).value).startsWith("Total spend")) spendCell = row.getCell(2);
    });
    expect(spendCell).not.toBeNull();
    const cell = spendCell as unknown as ExcelJS.Cell;
    expect(cell.type).toBe(ExcelJS.ValueType.Number);
    expect(cell.value).toBeCloseTo(spendCents / 100, 2);
  });

  it("Opportunities lists exactly 4 rate switches led by Westside Pump 17 (AG-C), with data bars", () => {
    const opps = workbook.getWorksheet("Opportunities");
    if (!opps) throw new Error("Opportunities sheet missing");
    let headerRowNumber = 0;
    opps.eachRow({ includeEmpty: false }, (row) => {
      if (row.getCell(1).value === "Meter" && row.getCell(5).value === "Est. annual savings") {
        headerRowNumber = row.number;
      }
    });
    expect(headerRowNumber).toBeGreaterThan(0);

    // Count the data rows after the header (a Meter name in col A with a numeric savings in col E).
    const oppNames: string[] = [];
    opps.eachRow({ includeEmpty: false }, (row) => {
      if (row.number <= headerRowNumber) return;
      const name = row.getCell(1).value;
      if (typeof name === "string" && row.getCell(5).type === ExcelJS.ValueType.Number) {
        oppNames.push(name);
      }
    });
    expect(oppNames).toHaveLength(4);

    const firstData = opps.getRow(headerRowNumber + 1);
    expect(firstData.getCell(1).value).toBe("Westside Pump 17");
    expect(firstData.getCell(4).value).toBe("AG-C"); // suggested rate from flags.suggestedRate
    const savings = firstData.getCell(5);
    expect(savings.type).toBe(ExcelJS.ValueType.Number);
    // ~$45,223.72 estimated annual rate-switch saving (modeledCurrent - modeledBest), the current
    // rate engine's output post-integration (corrected AG card + evolved rate engine from main);
    // night's pre-merge ground truth read $61,417.76 off the older engine.
    expect(savings.value).toBeCloseTo(45_223.72, 0);
    expect(cfRuleTypes(opps)).toContain("dataBar");
  });

  it("carries every Batth meter (183), no silent cap", () => {
    const meters = workbook.getWorksheet("Meters");
    if (!meters) throw new Error("Meters sheet missing");
    // The Meters sheet is exactly a header row + one row per meter (the chart lives on its own sheet),
    // so every data row carries a meter name in col A. Count distinct names below the header.
    let dataRows = 0;
    const names = new Set<string>();
    meters.eachRow({ includeEmpty: false }, (row) => {
      if (row.number === 1) return; // header
      const name = row.getCell(1).value;
      if (typeof name === "string" && name.length > 0) {
        dataRows += 1;
        names.add(name);
      }
    });
    // One data row per meter (no cap). Meter NAMES can repeat across entities/ranches on the real
    // farm, so the no-truncation guarantee is on the row COUNT, not the distinct-name count.
    expect(dataRows).toBe(183);
    expect(names.has("Westside Pump 17")).toBe(true);
  });
});
