import { describe, expect, it } from "vitest";
import { toMeterRow, filterMeters, sortRows, type MeterRow } from "./table";
import type { MeterView, MeterPeriodView } from "./load";
import type { CoverageState } from "@/lib/recommendations/types";

function period(
  close: string,
  printedTotalCents: number | null,
  demandCents: number | null = null,
): MeterPeriodView {
  return {
    start: close,
    close,
    printedTotalCents,
    demandCents,
    peakKw: null,
    tariff: "AGC",
    lineItems: [],
  };
}

// (filterMeters trim parity is covered below: a padded stored value still matches its
// trimmed filterOptions option.)
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
    cropName: null,
    growerPumpId: null,
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

describe("toMeterRow", () => {
  it("carries cost + demand only for a reconciled meter", () => {
    const row = toMeterRow(
      meter({ id: "a", coverageState: "reconciled", periods: [period("2026-03-12", 56031, 12781)] }),
    );
    expect(row.costCents).toBe(56031);
    expect(row.demandCents).toBe(12781);
    expect(row.coverageState).toBe("reconciled");
  });

  it("withholds cost + demand for a needs_review meter (never a fabricated 0)", () => {
    const row = toMeterRow(
      // even with a printed total present, an unreconciled figure is not trustworthy
      meter({ id: "b", coverageState: "needs_review", periods: [period("2026-03-12", 99999, 5000)] }),
    );
    expect(row.costCents).toBeNull();
    expect(row.demandCents).toBeNull();
  });

  it("withholds cost for a no_bill meter with no periods", () => {
    const row = toMeterRow(meter({ id: "c", coverageState: "no_bill", periods: [] }));
    expect(row.costCents).toBeNull();
    expect(row.demandCents).toBeNull();
  });

  it("a reconciled meter with no demand charge has a null demand but a real cost", () => {
    const row = toMeterRow(
      meter({ id: "d", coverageState: "reconciled", periods: [period("2026-03-12", 2747, null)] }),
    );
    expect(row.costCents).toBe(2747);
    expect(row.demandCents).toBeNull(); // honest absence, distinct from unreconciled
  });

  it("uses the LATEST period for cost (periods are start-ascending)", () => {
    const row = toMeterRow(
      meter({
        id: "e",
        coverageState: "reconciled",
        periods: [period("2026-02-12", 1000), period("2026-03-12", 2000)],
      }),
    );
    expect(row.costCents).toBe(2000);
  });

  it("flags status === BAD", () => {
    expect(toMeterRow(meter({ id: "f", coverageState: "reconciled", status: "BAD" })).isFlagged).toBe(true);
    expect(toMeterRow(meter({ id: "g", coverageState: "reconciled", status: "GOOD" })).isFlagged).toBe(false);
    expect(toMeterRow(meter({ id: "h", coverageState: "reconciled", status: null })).isFlagged).toBe(false);
  });

  it("preserves a negative latest total (NEM credit), never clamps to zero", () => {
    const row = toMeterRow(
      meter({ id: "i", coverageState: "reconciled", periods: [period("2026-03-12", -4200)] }),
    );
    expect(row.costCents).toBe(-4200);
  });
});

describe("filterMeters", () => {
  const meters = [
    meter({ id: "a", coverageState: "reconciled", rateSchedule: "AGC", ranchName: "West", entityName: "E1" }),
    meter({ id: "b", coverageState: "reconciled", rateSchedule: "AGB", ranchName: "East", entityName: "E1" }),
    meter({ id: "c", coverageState: "no_bill", rateSchedule: "AGC", ranchName: null, entityName: null }),
  ];

  it("a padded stored value still matches its trimmed option (trim parity both sides)", () => {
    const padded = [meter({ id: "p", coverageState: "reconciled", rateSchedule: "AGA2 " })];
    expect(filterMeters(padded, { rate: "AGA2" }).length).toBe(1);
    expect(filterMeters(padded, { rate: "AGA2 " }).length).toBe(1);
  });

  it("an empty filter returns the whole farm", () => {
    expect(filterMeters(meters, {}).length).toBe(3);
    expect(filterMeters(meters, { rate: "", ranch: null, entity: undefined }).length).toBe(3);
  });

  it("filters by an exact rate match", () => {
    expect(filterMeters(meters, { rate: "AGC" }).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("filters by ranch and entity together (AND)", () => {
    expect(filterMeters(meters, { entity: "E1", ranch: "West" }).map((m) => m.id)).toEqual(["a"]);
  });

  it("a no-match filter returns an empty list (the lens shows 'No meters match')", () => {
    expect(filterMeters(meters, { rate: "NOPE" })).toEqual([]);
  });

  it("trims whitespace-only keys to a no-op", () => {
    expect(filterMeters(meters, { rate: "   " }).length).toBe(3);
  });
});

describe("sortRows", () => {
  const rows: MeterRow[] = [
    meter({ id: "alpha", coverageState: "reconciled", periods: [period("2026-03-12", 5000, 100)] }),
    meter({ id: "bravo", coverageState: "needs_review", periods: [period("2026-03-12", 99999, 9999)] }),
    meter({ id: "charlie", coverageState: "reconciled", periods: [period("2026-03-12", 20000, null)] }),
  ].map(toMeterRow);

  it("sorts by cost ascending with unreconciled (null) rows last", () => {
    const order = sortRows(rows, "cost", "asc").map((r) => r.name);
    expect(order).toEqual(["alpha", "charlie", "bravo"]); // 5000, 20000, then null (bravo)
  });

  it("sorts by cost descending but STILL keeps null rows last (not flipped to the top)", () => {
    const order = sortRows(rows, "cost", "desc").map((r) => r.name);
    expect(order).toEqual(["charlie", "alpha", "bravo"]); // 20000, 5000, then null (bravo)
  });

  it("sorts by demand: reconciled-no-demand (null) sorts with the other nulls, last", () => {
    const order = sortRows(rows, "demand", "asc").map((r) => r.name);
    // alpha=100 first; charlie (reconciled, no demand -> null) and bravo (unreconciled -> null) last,
    // tie-broken by name ascending
    expect(order).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("sorts by coverage in attention order (reconciled before needs_review)", () => {
    const order = sortRows(rows, "coverage", "asc").map((r) => r.coverageState);
    expect(order).toEqual(["reconciled", "reconciled", "needs_review"]);
  });

  it("sorts by name ascending and descending", () => {
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual(["alpha", "bravo", "charlie"]);
    expect(sortRows(rows, "name", "desc").map((r) => r.name)).toEqual(["charlie", "bravo", "alpha"]);
  });

  it("is pure (does not mutate the input)", () => {
    const before = rows.map((r) => r.name);
    sortRows(rows, "cost", "desc");
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});
