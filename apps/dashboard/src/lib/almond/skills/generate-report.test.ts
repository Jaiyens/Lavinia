import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { AlmondToolDeps } from "@/lib/almond/tools";
import {
  applyFilter,
  generateReportInputSchema,
  previewLine,
  reportFileName,
  resolveFilter,
  resolveSections,
  runGenerateReport,
  type ReportSectionKind,
} from "./generate-report";
import type { MeterView } from "@/lib/dashboard/load";

/**
 * Offline unit tests for the generateReport skill (Story 9.3). Zero external calls: we drive the REAL
 * skill over a minimal in-memory fake of the Prisma calls the loaders make (`pump.findMany` for the
 * inventory + findings' meter-name map, `recommendation.findMany` for the findings), render a REAL PDF
 * through pure-JS @react-pdf/renderer (no Chromium, no Puppeteer), and assert the bytes are a real,
 * non-empty %PDF- stream. The end-to-end "stub responder emits a download card AND saves a row over a
 * seeded farm" assertion lives in the .db.test.ts (needs Postgres + a Blob store).
 */

// The minimal pump row shape loadMetersForFarm's projection reads (mirrors export-spreadsheet.test.ts).
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
  status?: string | null;
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
    status: o.status ?? null,
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

// A stored rate-switch Recommendation, the grounded source for the savings + mis-rated sections.
type FakeRec = {
  id: string;
  situation: string;
  action: unknown;
  impactUsd: number | null;
  impactNote: string | null;
  severity: string;
  status: string;
  result: unknown;
  createdAt: Date;
};

// Mirrors the PRODUCTION rate lever's stored action exactly (run-rate-lever.ts:139): the machine verb
// is `kind: "switch_rate"`, the farmer-facing label is `en.rateOptimization.action(to)` = "Move it to
// {to}" - which deliberately never contains the word "switch" - and `params.to` is the suggested rate.
// The report must identify the switch off the grounded `kind`/`params.to`, NEVER by string-matching
// this label, so the fixture uses the real label (not a "Switch to ..." fiction).
function switchRateRec(pumpId: string, toRate: string, savingsUsd: number): FakeRec {
  return {
    id: `rec_${pumpId}`,
    situation: `Pump ${pumpId} could move to a cheaper rate.`,
    action: { kind: "switch_rate", label: `Move it to ${toRate}`, params: { pumpId, to: toRate } },
    impactUsd: savingsUsd,
    impactNote: "Estimated from PG&E published rates.",
    severity: "act",
    status: "pending",
    result: null,
    createdAt: new Date("2026-03-01"),
  };
}

/** A typed fake exposing `pump.findMany` and `recommendation.findMany`, honoring where.farmId. */
function fakePrisma(pumps: FakePump[], recs: FakeRec[] = []): PrismaClient {
  return {
    pump: {
      // loadMetersForFarm passes a rich `select`; loadFindings passes `select: { id, name }`. The
      // fake returns the full rows either way (extra fields are harmless), so both loaders work.
      findMany: async ({ where }: { where: { farmId: string } }) =>
        where.farmId === "farm_1" ? pumps : [],
    },
    recommendation: {
      findMany: async ({ where }: { where: { farmId: string } }) =>
        where.farmId === "farm_1" ? recs : [],
    },
  } as unknown as PrismaClient;
}

function depsFor(pumps: FakePump[], recs: FakeRec[] = [], farmName = "Batth Farms"): AlmondToolDeps {
  return { prisma: fakePrisma(pumps, recs), farmId: "farm_1", farmName };
}

const PDF = "%PDF-";
const isPdf = (bytes: Uint8Array): boolean =>
  Buffer.from(bytes.slice(0, 5)).toString("latin1") === PDF;

// --- The input schema: SHAPE ONLY -----------------------------------------------------------------

describe("generateReportInputSchema (shape only, no scope/value/prose)", () => {
  it("accepts the section selection + filter + meter shape", () => {
    const parsed = generateReportInputSchema.parse({
      sections: ["summary", "savings"],
      rate: "AG-A1",
      meter: "Pump 001",
    });
    expect(parsed).toEqual({ sections: ["summary", "savings"], rate: "AG-A1", meter: "Pump 001" });
  });

  it("carries NO farmId, value, prose, or file name field (FR7)", () => {
    const keys = Object.keys(generateReportInputSchema.shape).sort();
    expect(keys).toEqual(["entity", "meter", "ranch", "rate", "sections"]);
  });

  it("rejects an unknown section", () => {
    expect(generateReportInputSchema.safeParse({ sections: ["forecast"] }).success).toBe(false);
  });
});

// --- Pure shape helpers ---------------------------------------------------------------------------

describe("resolveSections (de-duped, defaulted, order preserved)", () => {
  it("preserves the model's chosen order and de-dupes", () => {
    expect(resolveSections({ sections: ["savings", "summary", "savings"] })).toEqual([
      "savings",
      "summary",
    ]);
  });

  it("defaults to a non-empty whole-farm shape (summary + meter table) when none chosen", () => {
    expect(resolveSections({})).toEqual(["summary", "meterTable"]);
    expect(resolveSections({ sections: [] })).toEqual(["summary", "meterTable"]);
  });
});

describe("resolveFilter / applyFilter", () => {
  const m = (rate: string | null, entity: string | null, ranch: string | null): MeterView =>
    ({ rateSchedule: rate, entityName: entity, ranchName: ranch } as unknown as MeterView);
  const meters = [m("AG-A1", "Batth LLC", "North"), m("AG-4", "Other LLC", "South"), m("AG-A1", "Batth LLC", "South")];

  it("resolveFilter names a single filter with rate > entity > ranch precedence", () => {
    expect(resolveFilter({ rate: "AG-A1" })).toEqual({ key: "rate", value: "AG-A1" });
    expect(resolveFilter({ ranch: "North" })).toEqual({ key: "ranch", value: "North" });
    expect(resolveFilter({})).toBeNull();
    expect(resolveFilter({ rate: "AG-A1", ranch: "North" })).toEqual({ key: "rate", value: "AG-A1" });
  });

  it("applyFilter narrows case-insensitively by every set filter, no cap", () => {
    expect(applyFilter(meters, { rate: "ag-a1" })).toHaveLength(2);
    expect(applyFilter(meters, { rate: "AG-A1", ranch: "south" })).toHaveLength(1);
    expect(applyFilter(meters, {})).toHaveLength(3);
    expect(applyFilter(meters, { rate: "NOPE" })).toHaveLength(0);
  });
});

describe("previewLine (the one-line shape statement, not an approval gate)", () => {
  it("states the chosen sections in order, in plain operator English", () => {
    const sections: ReportSectionKind[] = ["summary", "misRated", "savings"];
    expect(previewLine(sections, null)).toBe(
      "I will put together a one or two page summary: your farm's totals, the meters that may be on the wrong rate, and the dollars on each.",
    );
  });

  it("appends the single named filter when set", () => {
    expect(previewLine(["summary"], { key: "rate", value: "AG-A1" })).toBe(
      "I will put together a one or two page summary for AG-A1: your farm's totals.",
    );
  });

  it("carries no em dash and no exclamation mark (copy law)", () => {
    const line = previewLine(["summary", "meterTable"], { key: "ranch", value: "North" });
    expect(line).not.toMatch(/[—!]/);
  });
});

describe("reportFileName (server-authored, never a path)", () => {
  it("slugs the farm name with a .pdf extension and the default report suffix", () => {
    expect(reportFileName("Batth Farms", null)).toBe("batth-farms-report.pdf");
  });

  it("names the meter for a single-meter report, never a path separator", () => {
    expect(reportFileName("Batth Farms", "Pump 001")).toBe("batth-farms-pump-001.pdf");
    expect(reportFileName("Bob's Farm / North", null)).not.toContain("/");
    expect(reportFileName("  ", null)).toBe("farm-report.pdf");
  });
});

// --- runGenerateReport: real offline PDF bytes ----------------------------------------------------

describe("runGenerateReport (the file path, real PDF, zero external calls)", () => {
  it("builds a real, non-empty PDF over the FULL inventory (above the chat cap), no silent cap", async () => {
    const COUNT = 60; // > the chat-tool max of 50
    const pumps = Array.from({ length: COUNT }, (_, i) => makePump(i + 1, { close: "2026-03-12" }));
    const result = await runGenerateReport(depsFor(pumps), { sections: ["summary", "meterTable"] });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(isPdf(result.bytes)).toBe(true);
    expect(result.bytes.byteLength).toBeGreaterThan(2000); // a real, substantial PDF
    expect(result.meterCount).toBe(COUNT);
    expect(result.fileName).toBe("batth-farms-report.pdf");
    expect(result.contentType).toBe("application/pdf");
    expect(result.preview).toContain("one or two page summary");
    expect(result.coverageAsOf).toBe("2026-03-12T00:00:00.000Z");
    expect(result.params.sections).toEqual(["summary", "meterTable"]);
  });

  it("defaults to summary + meter table when no sections are chosen (never an empty PDF)", async () => {
    const result = await runGenerateReport(depsFor([makePump(1, { close: "2026-03-12" })]), {});
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(isPdf(result.bytes)).toBe(true);
    expect(result.params.sections).toEqual(["summary", "meterTable"]);
  });

  it("authors savings + mis-rated sections from the farm's rate-switch findings", async () => {
    const pumps = [
      makePump(1, { rateSchedule: "AG-1A", close: "2026-03-12" }),
      makePump(2, { rateSchedule: "AG-4B", close: "2026-03-12" }),
    ];
    const recs = [
      switchRateRec("pump_001", "AG-B", 4123),
      switchRateRec("pump_002", "AG-B", 887),
    ];
    const result = await runGenerateReport(depsFor(pumps, recs), {
      sections: ["savings", "misRated"],
    });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(isPdf(result.bytes)).toBe(true);
    // A savings/mis-rated report still covers the in-scope meters.
    expect(result.meterCount).toBe(2);
  });

  // Regression for the review finding: the production rate lever writes the label "Move it to {to}"
  // (en.rateOptimization.action), which does NOT contain "switch". The savings/mis-rated sections must
  // still author rows off the GROUNDED action kind + params.to, never a label string-match. A report
  // WITH real rate-switch findings must therefore be materially larger than the same report with NONE
  // (the populated savings/mis-rated tables add rows + dollars), proving no finding is silently dropped.
  it("populates savings off the GROUNDED action (production 'Move it to ...' label), not a label match", async () => {
    const pumps = [
      makePump(1, { rateSchedule: "AG-1A", close: "2026-03-12" }),
      makePump(2, { rateSchedule: "AG-4B", close: "2026-03-12" }),
    ];
    const sections: ReportSectionKind[] = ["savings", "misRated"];
    const withFindings = await runGenerateReport(
      depsFor(pumps, [switchRateRec("pump_001", "AG-B", 4123), switchRateRec("pump_002", "AG-B", 887)]),
      { sections },
    );
    const noFindings = await runGenerateReport(depsFor(pumps, []), { sections });
    expect(withFindings.kind).toBe("file");
    expect(noFindings.kind).toBe("file");
    if (withFindings.kind !== "file" || noFindings.kind !== "file") return;
    // The dollars the lever found (and the rate-switch rows) land in the PDF, so the populated report
    // carries strictly more bytes than the honest "no savings / nothing flagged" empty-section report.
    expect(withFindings.bytes.byteLength).toBeGreaterThan(noFindings.bytes.byteLength);
  });

  it("applies a filter and the report covers only the filtered set + its own coverage as-of", async () => {
    const pumps = [
      makePump(1, { rateSchedule: "AG-A1", close: "2026-03-12" }),
      makePump(2, { rateSchedule: "AG-4", close: "2026-02-01" }),
      makePump(3, { rateSchedule: "AG-A1", close: "2026-03-12" }),
    ];
    const result = await runGenerateReport(depsFor(pumps), {
      sections: ["summary", "meterTable"],
      rate: "AG-A1",
    });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.meterCount).toBe(2); // AG-4 excluded
    expect(result.preview).toContain("for AG-A1");
    // The as-of reflects only the filtered set (the AG-A1 close), never the excluded AG-4 cycle.
    expect(result.coverageAsOf).toBe("2026-03-12T00:00:00.000Z");
    expect(result.params.filterKey).toBe("rate");
    expect(result.params.filterValue).toBe("AG-A1");
  });

  it("builds a single-meter report for a resolved meter", async () => {
    const pumps = [makePump(1, { close: "2026-03-12" }), makePump(2, { close: "2026-03-12" })];
    const result = await runGenerateReport(depsFor(pumps), {
      sections: ["singleMeter"],
      meter: "Pump 001",
    });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(isPdf(result.bytes)).toBe(true);
    expect(result.fileName).toBe("batth-farms-pump-001.pdf");
    expect(result.params.meterQuery).toBe("Pump 001");
  });

  it("returns a typed EMPTY (never a report on the wrong pump) when a single-meter query misses", async () => {
    const pumps = [makePump(1, { close: "2026-03-12" })];
    const result = await runGenerateReport(depsFor(pumps), {
      sections: ["singleMeter"],
      meter: "Nonexistent Pump",
    });
    expect(result.kind).toBe("empty");
    if (result.kind !== "empty") return;
    expect(result.message).toContain("Nonexistent Pump");
  });

  it("returns a typed EMPTY (never an empty PDF) when a filter matches nothing", async () => {
    const pumps = [makePump(1, { rateSchedule: "AG-A1", close: "2026-03-12" })];
    const result = await runGenerateReport(depsFor(pumps), {
      sections: ["summary"],
      rate: "NONEXISTENT",
    });
    expect(result.kind).toBe("empty");
  });

  it("returns a typed EMPTY for a farm with no meters, never a crash or empty download", async () => {
    const result = await runGenerateReport(depsFor([]), { sections: ["summary"] });
    expect(result.kind).toBe("empty");
  });

  it("returns a typed ERROR (never a raw throw, never a partial file) when the read fails", async () => {
    const broken = {
      pump: { findMany: async () => { throw new Error("db down"); } },
      recommendation: { findMany: async () => [] },
    } as unknown as PrismaClient;
    const result = await runGenerateReport(
      { prisma: broken, farmId: "farm_1", farmName: "Batth Farms" },
      { sections: ["summary", "meterTable"] },
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("shows the coverage as-of as null when no bill has posted (never a fabricated date)", async () => {
    const pumps = [makePump(1, { coverageState: "no_bill" })];
    const result = await runGenerateReport(depsFor(pumps), { sections: ["summary", "meterTable"] });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.coverageAsOf).toBeNull();
    expect(isPdf(result.bytes)).toBe(true);
  });
});
