import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ExportLoadDeps } from "@/lib/almond/export/load";
import {
  applyFilter,
  exportFileName,
  exportSpreadsheetInputSchema,
  previewLine,
  resolveFilter,
  runExportSpreadsheet,
} from "./export-spreadsheet";
import type { MeterView } from "@/lib/dashboard/load";

/**
 * Offline unit tests for the exportSpreadsheet skill (Story 8.5). Zero external calls: we drive the
 * REAL skill over a minimal in-memory fake of the single Prisma call the loader makes
 * (`pump.findMany`), build the REAL .xlsx through exceljs (pure JS), then read the bytes back to
 * prove the file is real and carries the right meters. The end-to-end "stub responder emits a
 * download card over a seeded farm" assertion lives in the .db.test.ts (needs Postgres).
 */

// The minimal pump row shape loadMetersForFarm's projection reads (mirrors export/load.test.ts).
type FakePump = {
  id: string;
  name: string;
  serviceId: string | null;
  rateSchedule: string | null;
  serialCode: string | null;
  isLegacy: boolean;
  status: string | null;
  coverageState: string;
  account: { number: string | null; entity: { name: string } | null } | null;
  ranch: { name: string } | null;
  crop: { name: string } | null;
  latitude: number | null;
  longitude: number | null;
  gpm: number | null;
  isSolar: boolean;
  nemType: string | null;
  trueUpMonth: number | null;
  trueUpAmountCents: number | null;
  trueUpDate: Date | null;
  solarKw: number | null;
  benefitingArrays: never[];
  growerPumpId: string | null;
  nemPeriods: never[];
  billingPeriods: {
    start: Date;
    close: Date;
    printedTotalCents: number | null;
    demandChargeUsd: number | null;
    peakKw: number | null;
    tariff: string | null;
    billingLineItems: never[];
  }[];
};

type PumpOverrides = {
  rateSchedule?: string | null;
  ranch?: string | null;
  entity?: string | null;
  coverageState?: string;
  close?: string;
  printedTotalCents?: number | null;
};

function makePump(i: number, o: PumpOverrides = {}): FakePump {
  const coverageState = o.coverageState ?? "reconciled";
  const printedTotalCents = "printedTotalCents" in o ? (o.printedTotalCents ?? null) : 100_00;
  const billingPeriods =
    o.close === undefined
      ? []
      : [
          {
            start: new Date(o.close),
            close: new Date(o.close),
            printedTotalCents,
            demandChargeUsd: null,
            peakKw: null,
            tariff: "AG-A1",
            billingLineItems: [] as never[],
          },
        ];
  return {
    id: `pump_${String(i).padStart(3, "0")}`,
    name: `Pump ${String(i).padStart(3, "0")}`,
    serviceId: `SA-${i}`,
    rateSchedule: o.rateSchedule === undefined ? "AG-A1" : o.rateSchedule,
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState,
    account: { number: "ACCT-1", entity: { name: o.entity ?? "Batth Farms LLC" } },
    ranch: o.ranch === undefined ? { name: "North Ranch" } : o.ranch === null ? null : { name: o.ranch },
    crop: { name: "Almonds" },
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
    billingPeriods,
  };
}

/** A typed fake exposing only `pump.findMany`, honoring the where.farmId filter. */
function fakePrisma(pumpsByFarm: Record<string, FakePump[]>): PrismaClient {
  return {
    pump: {
      findMany: async ({ where }: { where: { farmId: string } }) => pumpsByFarm[where.farmId] ?? [],
    },
  } as unknown as PrismaClient;
}

function depsFor(pumps: FakePump[], farmName = "Batth Farms"): ExportLoadDeps {
  return { prisma: fakePrisma({ farm_1: pumps }), farmId: "farm_1", farmName };
}

/** Read the bytes back into a workbook and return the single sheet's cells as a string grid. */
async function readGrid(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
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

describe("exportSpreadsheetInputSchema (shape only)", () => {
  it("accepts the table + filter shape and carries NO scope/value/path", () => {
    const parsed = exportSpreadsheetInputSchema.parse({ table: "meters", rate: "AG-A1" });
    expect(parsed).toEqual({ table: "meters", rate: "AG-A1" });
    // No farmId / value / fileName / columns field exists on the schema (shape only, FR7).
    const keys = Object.keys(exportSpreadsheetInputSchema.shape).sort();
    expect(keys).toEqual(["entity", "ranch", "rate", "table"]);
  });

  it("rejects an unknown table", () => {
    expect(exportSpreadsheetInputSchema.safeParse({ table: "invoices" }).success).toBe(false);
  });
});

describe("resolveFilter / applyFilter", () => {
  const meters: MeterView[] = [];
  // Build MeterView[] indirectly is not needed here; applyFilter reads only rate/entity/ranch.
  const m = (rate: string | null, entity: string | null, ranch: string | null): MeterView =>
    ({ rateSchedule: rate, entityName: entity, ranchName: ranch } as unknown as MeterView);
  meters.push(m("AG-A1", "Batth LLC", "North"), m("AG-4", "Other LLC", "South"), m("AG-A1", "Batth LLC", "South"));

  it("resolveFilter names the single filter with rate > entity > ranch precedence", () => {
    expect(resolveFilter({ rate: "AG-A1" })).toEqual({ key: "rate", value: "AG-A1" });
    expect(resolveFilter({ entity: "Batth" })).toEqual({ key: "entity", value: "Batth" });
    expect(resolveFilter({ ranch: "North" })).toEqual({ key: "ranch", value: "North" });
    expect(resolveFilter({})).toBeNull();
    // Precedence: rate wins when several are set (rows are still narrowed by ALL in applyFilter).
    expect(resolveFilter({ rate: "AG-A1", ranch: "North" })).toEqual({ key: "rate", value: "AG-A1" });
  });

  it("applyFilter narrows case-insensitively by every set filter, no cap", () => {
    expect(applyFilter(meters, { rate: "ag-a1" })).toHaveLength(2);
    expect(applyFilter(meters, { rate: "AG-A1", ranch: "south" })).toHaveLength(1);
    expect(applyFilter(meters, {})).toHaveLength(3);
    expect(applyFilter(meters, { rate: "NOPE" })).toHaveLength(0);
  });
});

describe("previewLine (one-line preview, not an approval gate)", () => {
  it("states the count, table, and filter in plain operator English", () => {
    expect(previewLine(14, "meters", { key: "rate", value: "AG-A1" })).toBe(
      "I will export your 14 meters on AG-A1 as a meters spreadsheet.",
    );
    expect(previewLine(1, "meters", null)).toBe("I will export your 1 meter as a meters spreadsheet.");
    expect(previewLine(7, "billDue", { key: "ranch", value: "North" })).toBe(
      "I will export your 7 meters in North ranch as a bill due dates spreadsheet.",
    );
  });

  it("carries no em dash and no exclamation mark (copy law)", () => {
    const line = previewLine(3, "meters", { key: "entity", value: "Batth LLC" });
    expect(line).not.toMatch(/[—!]/);
  });
});

describe("exportFileName (server-authored, never a path)", () => {
  it("slugs the farm name and names the table, with a .xlsx extension and no path separator", () => {
    expect(exportFileName("Batth Farms", "meters")).toBe("batth-farms-meters.xlsx");
    expect(exportFileName("Batth Farms", "billDue")).toBe("batth-farms-bill-due.xlsx");
    expect(exportFileName("  ", "meters")).toBe("farm-meters.xlsx");
    expect(exportFileName("Bob's Farm / North", "meters")).not.toContain("/");
  });
});

describe("runExportSpreadsheet (the file path)", () => {
  it("builds a real, non-empty .xlsx over the FULL inventory (above the chat cap), no silent cap", async () => {
    const COUNT = 60; // > the chat-tool max of 50
    const pumps = Array.from({ length: COUNT }, (_, i) => makePump(i + 1, { close: "2026-03-12" }));
    const result = await runExportSpreadsheet(depsFor(pumps), { table: "meters" });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.byteLength).toBeGreaterThan(1000); // a real zipped workbook
    expect(result.meterCount).toBe(COUNT);
    expect(result.fileName).toBe("batth-farms-meters.xlsx");
    expect(result.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(result.preview).toContain("60 meters");
    // The file actually carries every meter (no truncation at either end).
    const grid = await readGrid(result.bytes);
    const names = grid.map((r) => r[0]).filter((n) => n?.startsWith("Pump "));
    expect(names).toHaveLength(COUNT);
    expect(names[0]).toBe("Pump 001");
    expect(names[COUNT - 1]).toBe("Pump 060");
  });

  it("applies a filter and the file + preview reflect only the filtered set", async () => {
    const pumps = [
      makePump(1, { rateSchedule: "AG-A1", close: "2026-03-12" }),
      makePump(2, { rateSchedule: "AG-4", close: "2026-03-12" }),
      makePump(3, { rateSchedule: "AG-A1", close: "2026-03-12" }),
    ];
    const result = await runExportSpreadsheet(depsFor(pumps), { table: "meters", rate: "AG-A1" });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.meterCount).toBe(2);
    expect(result.preview).toBe("I will export your 2 meters on AG-A1 as a meters spreadsheet.");
    const grid = await readGrid(result.bytes);
    const names = grid.map((r) => r[0]).filter((n) => n?.startsWith("Pump "));
    expect(names).toEqual(["Pump 001", "Pump 003"]); // Pump 002 (AG-4) excluded
    // The footer states coverage for the FILTERED set (2 meters), not the whole farm.
    const flat = grid.map((r) => r.join(" ")).join("\n");
    expect(flat).toContain("All 2 meters included");
  });

  it("builds the bill-due table when asked", async () => {
    const pumps = [makePump(1, { close: "2026-03-12" })];
    const result = await runExportSpreadsheet(depsFor(pumps), { table: "billDue" });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.fileName).toBe("batth-farms-bill-due.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.bytes as unknown as ArrayBuffer);
    expect(wb.worksheets[0]?.name).toBe("Bill due dates");
  });

  it("shows the coverage label for an unreconciled meter, never a fabricated or zero figure", async () => {
    const pumps = [
      makePump(1, { coverageState: "reconciled", close: "2026-03-12", printedTotalCents: 1172733 }),
      makePump(2, { coverageState: "no_bill" }),
    ];
    const result = await runExportSpreadsheet(depsFor(pumps), { table: "meters" });
    if (result.kind !== "file") throw new Error("expected file");
    const grid = await readGrid(result.bytes);
    const recon = grid.find((r) => r[0] === "Pump 001");
    const noBill = grid.find((r) => r[0] === "Pump 002");
    expect(recon?.[5]).toBe("$11,727.33"); // real whole-dollar money
    expect(noBill?.[5]).toBe("No bill yet"); // coverage label, never $0
  });

  it("returns a typed EMPTY outcome (never an empty file) when a filter matches nothing", async () => {
    const pumps = [makePump(1, { rateSchedule: "AG-A1", close: "2026-03-12" })];
    const result = await runExportSpreadsheet(depsFor(pumps), { table: "meters", rate: "NONEXISTENT" });
    expect(result.kind).toBe("empty");
    if (result.kind !== "empty") return;
    expect(result.message).toContain("nothing to export");
  });

  it("returns a typed EMPTY outcome for a farm with no meters, never a crash or empty download", async () => {
    const result = await runExportSpreadsheet(depsFor([]), { table: "meters" });
    expect(result.kind).toBe("empty");
  });

  it("returns a typed ERROR (never a raw throw, never a partial file) when the read fails", async () => {
    // A prisma whose findMany rejects: the skill must catch it and return a typed error.
    const broken = {
      pump: { findMany: async () => { throw new Error("db down"); } },
    } as unknown as PrismaClient;
    const result = await runExportSpreadsheet(
      { prisma: broken, farmId: "farm_1", farmName: "Batth Farms" },
      { table: "meters" },
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message.length).toBeGreaterThan(0);
  });
});
