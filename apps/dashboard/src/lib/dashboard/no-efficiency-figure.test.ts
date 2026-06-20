import { describe, expect, it } from "vitest";
import type { MeterView } from "./load";
import { toMeterRow } from "./table";
import { toDrawerDetail } from "./drawer";

// FR-17's honesty law as a regression guard (Story 3.6): GPM is on file, but
// runtime and pumped volume are NOT - so any kWh-per-gallon or "efficiency"
// figure would be an invented number. Today no such figure exists anywhere;
// this test pins that absence at the meter-facing view models, the same way
// no-raw-source-in-ui.test.ts pins the source boundary.
//
// Scope and limits, stated honestly: the scan covers KEY NAMES and STRING
// VALUES of plain JSON shapes (view models are RSC props, so plain JSON by
// construction - no Maps/getters to miss). It cannot prove a negative over
// every conditional branch or future surface; it exists to make the LIKELY
// regression (an efficiency-shaped field or a per-gallon phrase landing in a
// projection) fail loudly with a pointer to the law.

// Key spellings an invented figure would plausibly use: efficiency*, *gallon*,
// kwhPer*/kwPer* (kwPerGpm is the most likely first offender given gpm and
// peakKw both exist), wireToWater, specificEnergy.
const FORBIDDEN_KEY = /effic|gallon|kwh.?per|kw.?per|wireto|specificenergy/i;
// Phrasings that would smuggle the figure through a label/note string value.
const FORBIDDEN_VALUE = /(kwh?|kilowatt)\s*(-|\s)?\s*(hours?\s*)?per\s*(gallon|gal\b|acre)/i;

function violations(value: unknown, path: string, seen: Set<unknown>): string[] {
  if (typeof value === "string") {
    return FORBIDDEN_VALUE.test(value) ? [`${path} = "${value}"`] : [];
  }
  if (typeof value !== "object" || value === null) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => violations(v, `${path}[${i}]`, seen));
  }
  return Object.entries(value).flatMap(([key, v]) => {
    const keyPath = path === "" ? key : `${path}.${key}`;
    const here = FORBIDDEN_KEY.test(key) ? [keyPath] : [];
    return [...here, ...violations(v, keyPath, seen)];
  });
}

function scan(value: unknown): string[] {
  return violations(value, "", new Set());
}

// A rich meter: GPM, BAD status, solar facts, NEM months, arrays, serial, and a
// billed period - exercising the projections' conditional branches (solar
// section, NEM summary, flagged status), not just the sparse happy path.
const meter: MeterView = {
  id: "m1",
  name: "Pump 21",
  serviceId: "SA-1",
  rateSchedule: "AGC Ag35+ kW High Use",
  serialCode: "Q",
  isLegacy: false,
  status: "BAD",
  coverageState: "reconciled",
  accountNumber: "A1",
  ranchName: "North Ranch",
  entityName: "Batth Farms LLC",
  cropName: "Almonds",
  latitude: 36.7,
  longitude: -120.4,
  gpm: 450,
  isSolar: true,
  nemType: "nem2",
  trueUpMonth: 12,
  trueUpAmountCents: 713031,
  trueUpDate: "2025-12-15T00:00:00.000Z",
  solarKw: 840,
  benefitingArrays: [
    { id: "arr1", name: "South Array", nameplateKw: 840, nemType: "nem2", trueUpMonth: 12 },
  ],
  growerPumpId: "P021",
  nemPeriods: [
    { start: "2026-01-01T00:00:00.000Z", close: "2026-01-31T00:00:00.000Z", netKwh: 14, amountCents: 240 },
  ],
  periods: [
    {
      start: "2026-02-11T00:00:00.000Z",
      close: "2026-03-12T00:00:00.000Z",
      printedTotalCents: 282622,
      demandCents: 278322,
      totalKwh: null,
      peakKw: 244.32,
      tariff: "AGC",
      lineItems: [
        { kind: "tou_energy", label: "Peak", amountCents: 100, quantity: 10, unit: "kWh", rate: 0.18 },
        { kind: "demand", label: "Max Demand", amountCents: 278322, quantity: 244.32, unit: "kW", rate: null },
        { kind: "other", label: "Customer Charge 30 days @ $1.43343", amountCents: 4300, quantity: null, unit: null, rate: null },
      ],
    },
  ],
};

describe("no efficiency figure is ever derived (FR-17)", () => {
  it("the scanner itself catches efficiency-shaped keys and per-gallon values at depth", () => {
    expect(scan({ a: { b: [{ kwhPerGallon: 1 }] } })).toEqual(["a.b[0].kwhPerGallon"]);
    expect(scan({ rows: [{ kwPerGpm: 2 }] })).toEqual(["rows[0].kwPerGpm"]);
    expect(scan({ note: "draws 0.42 kWh per gallon" })).toHaveLength(1);
    expect(scan({ gpm: 450, peakKw: 244 })).toEqual([]); // capacity facts are legal
  });

  it("the meter view, table row, and drawer detail carry no efficiency-shaped field or phrase", () => {
    expect(scan(meter)).toEqual([]);
    expect(scan(toMeterRow(meter))).toEqual([]);
    expect(scan(toDrawerDetail(meter))).toEqual([]);
  });

  it("GPM passes through as a capacity fact and BAD is the only flag carrier", () => {
    const row = toMeterRow(meter);
    expect(row.meter.gpm).toBe(450); // carried, never transformed
    expect(row.isFlagged).toBe(true); // BAD flags (AC1)
    // Healthy statuses must NOT flag - the mobile card's BAD-only law.
    for (const status of ["GOOD", "NEW WELL", "OLD", null]) {
      expect(toMeterRow({ ...meter, id: `m-${status}`, status }).isFlagged).toBe(false);
    }
  });
});
