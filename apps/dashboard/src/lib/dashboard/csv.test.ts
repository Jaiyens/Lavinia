import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView, MeterArrayView } from "./load";
import { toMeterRow, type MeterRow } from "./table";
import { metersCsv, solarMetersCsv, solarHeader } from "./csv";

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

function row(over: Partial<MeterView> & { id: string; coverageState: CoverageState }): MeterRow {
  return toMeterRow(meter(over));
}

const period = (totalCents: number | null, demandCents: number | null, peakKw: number | null = null) => ({
  start: "2026-02-11T00:00:00.000Z",
  close: "2026-03-12T00:00:00.000Z",
  printedTotalCents: totalCents,
  demandCents,
  totalKwh: null,
  peakKw,
  tariff: "AGC",
  lineItems: [],
});

function parse(csv: string): string[][] {
  // Test-side parse for simple cases (no embedded newlines in these fixtures).
  return csv
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((l) => l !== "")
    .map((l) => l.split(","));
}

describe("metersCsv", () => {
  it("starts with a BOM, uses CRLF, and writes the nine table headers in order", () => {
    const csv = metersCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(parse(csv)[0]).toEqual([
      "Meter",
      "Ranch",
      "Entity",
      "Rate",
      "Peak kW",
      "This cycle",
      "Demand charge",
      "Status",
      "Coverage",
    ]);
  });

  it("exports a reconciled row's real figures, including a negative NEM credit", () => {
    const csv = metersCsv([
      row({ id: "P002", coverageState: "reconciled", periods: [period(-14911, null)] }),
      row({ id: "P054", coverageState: "reconciled", periods: [period(1172733, 278322)] }),
    ]);
    const rows = parse(csv);
    expect(rows[1]).toContain("-$149.11");
    // Figures formatted with a thousands comma are quoted per RFC 4180.
    expect(csv).toContain('"$11,727.33"');
    expect(csv).toContain('"$2,783.22"');
  });

  it("exports the coverage label for unreconciled money cells, never a number", () => {
    const csv = metersCsv([
      row({ id: "a", coverageState: "needs_review", periods: [period(5000, 100)] }),
      row({ id: "b", coverageState: "no_bill" }),
    ]);
    const rows = parse(csv);
    expect(rows[1]?.[5]).toBe("Needs review");
    expect(rows[1]?.[6]).toBe("Needs review");
    expect(rows[2]?.[5]).toBe("No bill yet");
    expect(csv).not.toContain("$50.00");
    expect(csv).not.toContain("$1.00");
  });

  it("exports None for a reconciled meter with no demand charge and empty cells for null fields", () => {
    const csv = metersCsv([row({ id: "a", coverageState: "reconciled", rateSchedule: null, periods: [period(100, null)] })]);
    const r = parse(csv)[1];
    expect(r?.[6]).toBe("None"); // demand
    expect(r?.[1]).toBe(""); // ranch
    expect(r?.[3]).toBe(""); // rate
    expect(r?.[7]).toBe(""); // status
  });

  it("escapes commas and quotes per RFC 4180 and preserves row order", () => {
    const csv = metersCsv([
      row({ id: "b", name: 'Well "B", south', coverageState: "no_bill", rateSchedule: "B1 Bus, Low Use" }),
      row({ id: "a", coverageState: "no_bill" }),
    ]);
    expect(csv).toContain('"Well ""B"", south"');
    expect(csv).toContain('"B1 Bus, Low Use"');
    const body = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(body[1]?.startsWith('"Well')).toBe(true);
    expect(body[2]?.startsWith("a")).toBe(true);
  });

  it("pins every column's placement with non-null inventory values", () => {
    const csv = metersCsv([
      row({
        id: "P010",
        coverageState: "reconciled",
        ranchName: "South Ranch",
        entityName: "Batth Bros",
        rateSchedule: "AGA2",
        isLegacy: true,
        status: "BAD",
        periods: [period(5000, 200, 318)],
      }),
    ]);
    expect(parse(csv)[1]).toEqual([
      "P010",
      "South Ranch",
      "Batth Bros",
      "AGA2",
      "318",
      "$50.00",
      "$2.00",
      "BAD",
      "Loaded",
    ]);
  });

  it("exports an empty cell for the (1.7-impossible) reconciled-without-total cost", () => {
    const csv = metersCsv([row({ id: "a", coverageState: "reconciled", periods: [] })]);
    const r = parse(csv)[1];
    expect(r?.[5]).toBe(""); // cost: no figure, no fabrication
    expect(r?.[6]).toBe("None"); // demand: honest absence label
  });

  it("exports the rounded peak kW, empty when there is no peak reading", () => {
    const csv = metersCsv([
      row({ id: "a", coverageState: "reconciled", periods: [period(5000, 200, 41.6)] }),
      row({ id: "b", coverageState: "no_bill" }),
    ]);
    const rows = parse(csv);
    expect(rows[1]?.[4]).toBe("42");
    expect(rows[2]?.[4]).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------
// The Solar tab CSV export (A-8, FR36, UX-DR7).

const array = (over: Partial<MeterArrayView> & { id: string }): MeterArrayView => ({
  name: over.id,
  nameplateKw: 840,
  nemType: "nem2",
  trueUpMonth: null,
  interconnectionDate: null,
  ...over,
});

describe("solarMetersCsv", () => {
  it("starts with a BOM, uses CRLF, and writes the seven solar headers in order", () => {
    const csv = solarMetersCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(parse(csv)[0]).toEqual([
      "Meter",
      "Program",
      "Solar size",
      "Array",
      "Share",
      "True-up",
      "Coverage",
    ]);
    // The header builder and the rendered header agree (one definition).
    expect(solarHeader()).toEqual(parse(csv)[0]);
  });

  it("writes one row per solar meter in the order passed, with the per-meter solar fields", () => {
    const csv = solarMetersCsv([
      meter({
        id: "P002",
        coverageState: "reconciled",
        isSolar: true,
        nemType: "nem2",
        solarKw: 840,
        trueUpMonth: 9,
        benefitingArrays: [array({ id: "Array A" })],
      }),
      meter({
        id: "P054",
        coverageState: "needs_review",
        isSolar: true,
        nemType: null,
        solarKw: null,
        trueUpMonth: null,
        benefitingArrays: [],
      }),
    ]);
    const rows = parse(csv);
    expect(rows[1]).toEqual(["P002", "NEM2", "840 kW", "Array A", "not on file", "September", "Loaded"]);
    // A meter with no NEM token, no nameplate, no array, no true-up reads not-on-file in each cell,
    // never a guessed code or a fabricated zero (FR2/FR3/FR5).
    expect(rows[2]).toEqual(["P054", "Not on file", "Not on file", "Not on file", "not on file", "Not on file", "Needs review"]);
  });

  it("exports the honest-blank allocation marker, never a blank cell that reads as zero (FR36)", () => {
    const csv = solarMetersCsv([
      meter({ id: "P010", coverageState: "reconciled", isSolar: true, nemType: "nem2", solarKw: 500, benefitingArrays: [array({ id: "West" })] }),
    ]);
    const r = parse(csv)[1];
    // The allocation (Share) cell is the explicit marker, not an empty string.
    expect(r?.[4]).toBe("not on file");
    expect(r?.[4]).not.toBe("");
    // No fabricated dollar or percentage anywhere in the document (honest-blank, no percent-times-dollar).
    expect(csv).not.toMatch(/\$/);
    expect(csv).not.toMatch(/%/);
  });

  it("appends the array-to-meter allocation map naming each benefiting meter and its honest-blank share", () => {
    const csv = solarMetersCsv([
      meter({ id: "P1", coverageState: "reconciled", isSolar: true, nemType: "nem2", solarKw: 100, benefitingArrays: [array({ id: "North", nameplateKw: 840 })] }),
      meter({ id: "P2", coverageState: "reconciled", isSolar: true, nemType: "nem2", solarKw: 100, benefitingArrays: [array({ id: "North", nameplateKw: 840 })] }),
    ]);
    expect(csv).toContain("Array to meter allocation");
    const rows = parse(csv);
    const mapTitleIdx = rows.findIndex((r) => r[0] === "Array to meter allocation");
    expect(mapTitleIdx).toBeGreaterThan(0);
    // Inside the allocation-map section, the re-listed array appears once (one group), named with its
    // nameplate, then both meters are listed with the honest-blank share marker.
    const mapSection = rows.slice(mapTitleIdx);
    const arrayHeaders = mapSection.filter((r) => r[0] === "Array" && r[1] === "North");
    expect(arrayHeaders).toHaveLength(1);
    expect(arrayHeaders[0]).toEqual(["Array", "North", "Solar size", "840 kW"]);
    expect(mapSection.some((r) => r[0] === "P1" && r[1] === "not on file")).toBe(true);
    expect(mapSection.some((r) => r[0] === "P2" && r[1] === "not on file")).toBe(true);
  });

  it("round-trips the visible table: same rows, same order, one per solar meter", () => {
    const visible = [
      meter({ id: "Z", coverageState: "reconciled", isSolar: true, nemType: "nem2", solarKw: 1, benefitingArrays: [] }),
      meter({ id: "A", coverageState: "reconciled", isSolar: true, nemType: "nem2", solarKw: 2, benefitingArrays: [] }),
    ];
    const rows = parse(solarMetersCsv(visible));
    // Header, then exactly the two visible meters in the exact order passed (no re-sort in the export).
    expect(rows[1]?.[0]).toBe("Z");
    expect(rows[2]?.[0]).toBe("A");
  });

  it("escapes a comma-bearing array name per RFC 4180", () => {
    const csv = solarMetersCsv([
      meter({ id: "P1", coverageState: "reconciled", isSolar: true, nemType: "nem2", solarKw: 100, benefitingArrays: [array({ id: "x", name: "Array, A" })] }),
    ]);
    expect(csv).toContain('"Array, A"');
  });
});
