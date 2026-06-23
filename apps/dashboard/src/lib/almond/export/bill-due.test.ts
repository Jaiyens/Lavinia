import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import { gridCsv } from "@/lib/dashboard/csv";
import type { MeterReadSchedule } from "@/lib/greenbutton/schedule";
import type { ExportData } from "./load";
import {
  buildBillDueRows,
  billDueHeader,
  billDueCells,
  billDueCsvFromSchedule,
  billDueWorkbookFromSchedule,
} from "./bill-due";

// Pure offline test (no Prisma, no fs): we build MeterView[] and a MeterReadSchedule directly and
// drive the PURE bill-due path (the fs/clock entry points are thin wrappers over these). The law
// under test is billed-vs-scheduled: a scheduled close is marked scheduled and NEVER emitted as
// billed. We also assert the CSV reuses the shipped gridCsv (no parallel format) and the XLSX is a
// real workbook carrying every meter (no silent cap).

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

const period = (close: string, totalCents: number | null) => ({
  start: "2026-02-11T00:00:00.000Z",
  close,
  printedTotalCents: totalCents,
  demandCents: null,
  totalKwh: null,
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
    state: { coverage: { total: meters.length, reconciled, needsReview, noBill }, asOf: null },
  };
}

// A tiny schedule standing in for the committed fixture: serial Q reads on the 12th of each month.
const SCHEDULE: MeterReadSchedule = {
  year: 2026,
  cycles: {
    Q: [
      "2026-01-12",
      "2026-02-12",
      "2026-03-12",
      "2026-04-12",
      "2026-05-12",
      "2026-06-12",
      "2026-07-12",
      "2026-08-12",
      "2026-09-12",
      "2026-10-12",
      "2026-11-12",
      "2026-12-12",
    ],
  },
};

const REF = "2026-06-13"; // after the June read, so Q's next scheduled close is 2026-07-12

describe("buildBillDueRows (billed-vs-scheduled provenance)", () => {
  it("lists EVERY meter in loader order, no cap", () => {
    const meters = [
      meter({ id: "P003", coverageState: "no_bill" }),
      meter({ id: "P001", coverageState: "reconciled", serialCode: "Q", periods: [period("2026-03-12T00:00:00.000Z", 5000)] }),
      meter({ id: "P002", coverageState: "needs_review", serialCode: "Q" }),
    ];
    const rows = buildBillDueRows(exportData(meters), SCHEDULE, REF);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.meterName)).toEqual(["P003", "P001", "P002"]);
  });

  it("marks a posted bill's close BILLED with the printed date", () => {
    const m = meter({
      id: "Billed",
      coverageState: "reconciled",
      serialCode: "Q",
      periods: [period("2026-03-12T00:00:00.000Z", 5000)],
    });
    const [row] = buildBillDueRows(exportData([m]), SCHEDULE, REF);
    expect(row?.kind).toBe("billed");
    expect(row?.closeDate).toBe("2026-03-12");
  });

  it("marks a serial's next read SCHEDULED (may shift) when no bill is posted", () => {
    const m = meter({ id: "Sched", coverageState: "needs_review", serialCode: "Q" });
    const [row] = buildBillDueRows(exportData([m]), SCHEDULE, REF);
    expect(row?.kind).toBe("scheduled");
    expect(row?.closeDate).toBe("2026-07-12"); // next read on or after 2026-06-13
  });

  it("uses a posted bill over the schedule, even when the meter carries a serial", () => {
    // Both a posted bill AND a serial: the BILLED close wins; the scheduled date is not used.
    const m = meter({
      id: "Both",
      coverageState: "reconciled",
      serialCode: "Q",
      periods: [period("2026-05-12T00:00:00.000Z", 9000)],
    });
    const [row] = buildBillDueRows(exportData([m]), SCHEDULE, REF);
    expect(row?.kind).toBe("billed");
    expect(row?.closeDate).toBe("2026-05-12");
  });

  it("shows a coverage label and NO date when the serial is absent or unknown", () => {
    const meters = [
      meter({ id: "NoSerial", coverageState: "no_bill", serialCode: null }),
      meter({ id: "BadSerial", coverageState: "no_bill", serialCode: "14A" }), // not in the table
    ];
    const rows = buildBillDueRows(exportData(meters), SCHEDULE, REF);
    expect(rows[0]?.kind).toBe("no_serial");
    expect(rows[0]?.closeDate).toBeNull();
    expect(rows[1]?.kind).toBe("no_schedule");
    expect(rows[1]?.closeDate).toBeNull();
  });

  it("normalizes a stored serial (whitespace + case) before the lookup", () => {
    const m = meter({ id: "Lower", coverageState: "needs_review", serialCode: " q " });
    const [row] = buildBillDueRows(exportData([m]), SCHEDULE, REF);
    expect(row?.kind).toBe("scheduled");
    expect(row?.closeDate).toBe("2026-07-12");
  });

  it("never returns a metered/unposted period close as a billed date", () => {
    // A live-connected meter whose period has a close date but no printed total is NOT billed; it
    // falls through to the serial's scheduled read, marked scheduled.
    const m = meter({
      id: "Metered",
      coverageState: "needs_review",
      serialCode: "Q",
      periods: [period("2026-06-09T00:00:00.000Z", null)],
    });
    const [row] = buildBillDueRows(exportData([m]), SCHEDULE, REF);
    expect(row?.kind).not.toBe("billed");
    expect(row?.kind).toBe("scheduled");
    expect(row?.closeDate).toBe("2026-07-12");
  });
});

describe("billed-vs-scheduled law: a scheduled date is NEVER emitted as billed", () => {
  it("no scheduled-provenance row is ever tagged billed, across a mixed farm", () => {
    const meters = [
      meter({ id: "Billed", coverageState: "reconciled", serialCode: "Q", periods: [period("2026-03-12T00:00:00.000Z", 5000)] }),
      meter({ id: "Sched", coverageState: "needs_review", serialCode: "Q" }),
      meter({ id: "NoSerial", coverageState: "no_bill", serialCode: null }),
    ];
    const rows = buildBillDueRows(exportData(meters), SCHEDULE, REF);
    for (const row of rows) {
      // A scheduled date may only ever carry the scheduled status, never billed.
      if (row.kind === "scheduled") {
        expect(row.kind).not.toBe("billed");
        const cells = billDueCells(row);
        expect(cells[4]).toBe("Scheduled (may shift)");
        expect(cells[4]).not.toBe("Billed");
        // The scheduled date IS present in the row, but the status disambiguates it from billed.
        expect(cells[3]).toBe(row.closeDate);
      }
      // Only a posted-bill close may carry the billed status.
      if (billDueCells(row)[4] === "Billed") {
        expect(row.kind).toBe("billed");
      }
    }
  });

  it("the scheduled date for a serial is never printed under the Billed status in the CSV", () => {
    // The exact same serial Q yields a scheduled close 2026-07-12. It must appear ONLY beside the
    // scheduled status, never beside Billed.
    const m = meter({ id: "Sched", coverageState: "needs_review", serialCode: "Q" });
    const csv = billDueCsvFromSchedule(exportData([m]), SCHEDULE, REF);
    const body = csv.replace(/^﻿/, "").split("\r\n");
    const dataRow = body[1]?.split(",");
    expect(dataRow?.[3]).toBe("2026-07-12");
    expect(dataRow?.[4]).toBe("Scheduled (may shift)");
    // The scheduled date never co-occurs with the Billed label anywhere in the document.
    expect(csv).not.toMatch(/2026-07-12,Billed/);
  });
});

describe("billDueCsvFromSchedule (reuses gridCsv, no parallel format)", () => {
  it("renders through the shipped gridCsv: BOM, CRLF, the five headers", () => {
    const csv = billDueCsvFromSchedule(exportData([]), SCHEDULE, REF);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    const header = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(header).toBe("Meter,Ranch,Serial,Closing date,Status");
  });

  it("is gridCsv over exactly the header, rows, a spacer and the footer (no second CSV format)", () => {
    const meters = [
      meter({ id: "P001", coverageState: "reconciled", serialCode: "Q", ranchName: "North", periods: [period("2026-03-12T00:00:00.000Z", 5000)] }),
      meter({ id: "P002", coverageState: "needs_review", serialCode: "Q" }),
    ];
    const data = exportData(meters);
    const rows = buildBillDueRows(data, SCHEDULE, REF);
    const expected = gridCsv([
      billDueHeader(),
      ...rows.map(billDueCells),
      [],
      ["All 2 meters listed. 1 show a billed closing date and 1 show a scheduled date that may shift; the rest have no date on file."],
      ["A scheduled date is PG&E's planned meter read and may shift. It is never a billed total."],
    ]);
    expect(billDueCsvFromSchedule(data, SCHEDULE, REF)).toBe(expected);
  });

  it("states coverage in the footer (no silent cap) and restates the honesty note", () => {
    const meters = [
      meter({ id: "A", coverageState: "reconciled", serialCode: "Q", periods: [period("2026-03-12T00:00:00.000Z", 5000)] }),
      meter({ id: "B", coverageState: "needs_review", serialCode: "Q" }),
      meter({ id: "C", coverageState: "no_bill", serialCode: null }),
    ];
    const csv = billDueCsvFromSchedule(exportData(meters), SCHEDULE, REF);
    expect(csv).toContain("All 3 meters listed");
    expect(csv).toContain("1 show a billed closing date and 1 show a scheduled date that may shift");
    expect(csv).toContain("It is never a billed total");
  });
});

/** Read .xlsx bytes back into a cell grid for assertions. A real Excel date cell (the closing-date
    column now carries dates, not strings, so it sorts/filters as a date) is read back as its ISO
    date-only string, so the existing date assertions still read "2026-07-12". */
async function readGrid(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) cells.push("");
      else if (v instanceof Date) cells.push(v.toISOString().slice(0, 10));
      else cells.push(String(v));
    });
    grid.push(cells);
  });
  return grid;
}

describe("billDueWorkbookFromSchedule (reuses buildGridWorkbook, no parallel format)", () => {
  it("produces a real .xlsx with the tab name, title and headers", async () => {
    const bytes = await billDueWorkbookFromSchedule(
      exportData([meter({ id: "P001", coverageState: "no_bill" })]),
      SCHEDULE,
      REF,
    );
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets[0]?.name).toBe("Bill due dates");
    const grid = await readGrid(bytes);
    expect(grid[0]?.[0]).toBe("Batth Farms bill due dates");
    expect(grid[2]).toEqual(["Meter", "Ranch", "Serial", "Closing date", "Status"]);
  });

  it("at Batth scale (183 meters) carries EVERY meter, no silent cap", async () => {
    const COUNT = 183;
    const meters = Array.from({ length: COUNT }, (_, i) =>
      meter({ id: `Pump ${String(i + 1).padStart(3, "0")}`, coverageState: "needs_review", serialCode: "Q" }),
    );
    const grid = await readGrid(await billDueWorkbookFromSchedule(exportData(meters), SCHEDULE, REF));
    const names = grid.map((r) => r[0]).filter((n) => n !== undefined && n.startsWith("Pump "));
    expect(names).toHaveLength(COUNT);
    expect(names[0]).toBe("Pump 001");
    expect(names[COUNT - 1]).toBe("Pump 183");
  });

  it("never writes a scheduled date under the Billed status, and states the honesty note", async () => {
    const meters = [
      meter({ id: "Billed", coverageState: "reconciled", serialCode: "Q", periods: [period("2026-03-12T00:00:00.000Z", 5000)] }),
      meter({ id: "Sched", coverageState: "needs_review", serialCode: "Q" }),
    ];
    const grid = await readGrid(await billDueWorkbookFromSchedule(exportData(meters), SCHEDULE, REF));
    const billedRow = grid.find((r) => r[0] === "Billed");
    const schedRow = grid.find((r) => r[0] === "Sched");
    expect(billedRow?.[3]).toBe("2026-03-12");
    expect(billedRow?.[4]).toBe("Billed");
    expect(schedRow?.[3]).toBe("2026-07-12");
    expect(schedRow?.[4]).toBe("Scheduled (may shift)");
    const flat = grid.map((r) => r.join(" ")).join("\n");
    expect(flat).toContain("It is never a billed total");
  });

  it("applies the house style: a frozen header, an AutoFilter, and a REAL date in the closing-date column", async () => {
    const meters = [
      meter({ id: "Billed", coverageState: "reconciled", serialCode: "Q", periods: [period("2026-03-12T00:00:00.000Z", 5000)] }),
      meter({ id: "Sched", coverageState: "needs_review", serialCode: "Q" }),
    ];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      (await billDueWorkbookFromSchedule(exportData(meters), SCHEDULE, REF)) as unknown as ArrayBuffer,
    );
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error("sheet missing");
    // Frozen header + AutoFilter (the shared house style).
    expect(sheet.views[0]?.state).toBe("frozen");
    expect(sheet.autoFilter).toBeTruthy();
    // The closing-date cell is a REAL Excel date (sortable/filterable), not a string, with a date numFmt.
    let dateCell: ExcelJS.Cell | null = null;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.getCell(1).value === "Billed") dateCell = row.getCell(4);
    });
    expect(dateCell).not.toBeNull();
    const cell = dateCell as unknown as ExcelJS.Cell;
    expect(cell.type).toBe(ExcelJS.ValueType.Date);
    expect(cell.value instanceof Date).toBe(true);
    expect(typeof cell.numFmt).toBe("string");
    expect(cell.numFmt).toMatch(/yyyy-mm-dd/i);
  });
});
