import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "./load";
import { filterOptions } from "./filters";

function meter(over: Partial<MeterView> & { id: string }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: null,
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "no_bill" as CoverageState,
    accountNumber: null,
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

describe("filterOptions", () => {
  it("returns distinct sorted values per dimension", () => {
    const opts = filterOptions([
      meter({ id: "a", entityName: "Batth Bros", ranchName: "South", rateSchedule: "AGA2" }),
      meter({ id: "b", entityName: "Batth Bros", ranchName: "North", rateSchedule: "AG5B" }),
      meter({ id: "c", entityName: "AJ Farms", ranchName: "South", rateSchedule: "AGA2" }),
    ]);
    expect(opts.entities).toEqual(["AJ Farms", "Batth Bros"]);
    expect(opts.ranches).toEqual(["North", "South"]);
    expect(opts.rates).toEqual(["AG5B", "AGA2"]);
  });

  it("skips null, empty, and whitespace-only values (a dimension can end up empty)", () => {
    const opts = filterOptions([
      meter({ id: "a", entityName: null, ranchName: "", rateSchedule: "   " }),
      meter({ id: "b", entityName: null, ranchName: null, rateSchedule: "B1 Bus Low Use" }),
    ]);
    expect(opts.entities).toEqual([]);
    expect(opts.ranches).toEqual([]);
    expect(opts.rates).toEqual(["B1 Bus Low Use"]);
  });

  it("trims values before deduping", () => {
    const opts = filterOptions([
      meter({ id: "a", rateSchedule: "AGA2 " }),
      meter({ id: "b", rateSchedule: "AGA2" }),
    ]);
    expect(opts.rates).toEqual(["AGA2"]);
  });

  it("handles an empty farm", () => {
    expect(filterOptions([])).toEqual({ entities: [], ranches: [], rates: [] });
  });
});
