import { describe, expect, it } from "vitest";
import {
  farmNeedsLoaUpgrade,
  hasRealSource,
  isSmdAuthorized,
  type FarmSourceSummary,
} from "./sources";

// Story 5.2 AC2: confirm is gated until the farm has at least one REAL source - PG&E
// usage or a posted bill. A meter list (spreadsheet) or a v1 identity-only bill scan is
// inventory and does NOT pass on its own.
const summary = (over: Partial<FarmSourceSummary>): FarmSourceSummary => ({
  metersWithUsage: 0,
  metersWithBilling: 0,
  inventoryOnlyMeters: 0,
  ...over,
});

describe("hasRealSource", () => {
  it("is false for an empty farm", () => {
    expect(hasRealSource(summary({}))).toBe(false);
  });

  it("is false for a spreadsheet-only farm (inventory, no usage or billing)", () => {
    expect(hasRealSource(summary({ inventoryOnlyMeters: 12 }))).toBe(false);
  });

  it("is true once PG&E usage lands", () => {
    expect(hasRealSource(summary({ metersWithUsage: 1, inventoryOnlyMeters: 11 }))).toBe(true);
  });

  it("is true once a posted bill lands", () => {
    expect(hasRealSource(summary({ metersWithBilling: 1 }))).toBe(true);
  });
});

// C4 provenance: a connection's `source` distinguishes a true live Share-My-Data
// authorization from data (a bill / Green Button upload) that merely makes the farm legible.
describe("isSmdAuthorized", () => {
  it("is true only for a true SMD authorization", () => {
    expect(isSmdAuthorized({ source: "smd" })).toBe(true);
  });

  it("is false for bill-upload, green-button, sample, or unknown provenance", () => {
    expect(isSmdAuthorized({ source: "bill_upload" })).toBe(false);
    expect(isSmdAuthorized({ source: "green_button" })).toBe(false);
    expect(isSmdAuthorized({ source: "sample" })).toBe(false);
    expect(isSmdAuthorized({ source: null })).toBe(false);
  });
});

describe("farmNeedsLoaUpgrade", () => {
  const conn = (over: Partial<{ type: string; status: string; source: string | null }>) => ({
    type: "pge_smd",
    status: "active",
    source: null,
    ...over,
  });

  it("offers the upgrade to a bill-only farm (legible, but not SMD-authorized)", () => {
    expect(farmNeedsLoaUpgrade([conn({ source: "bill_upload" })])).toBe(true);
  });

  it("does NOT offer the upgrade once the farm is truly SMD-authorized", () => {
    expect(farmNeedsLoaUpgrade([conn({ source: "smd" })])).toBe(false);
  });

  it("does not offer the upgrade when there is no active PG&E connection yet", () => {
    expect(farmNeedsLoaUpgrade([])).toBe(false);
    expect(farmNeedsLoaUpgrade([conn({ status: "pending", source: "bill_upload" })])).toBe(false);
  });

  it("treats an SMD connection as authorized even alongside a bill connection", () => {
    expect(
      farmNeedsLoaUpgrade([conn({ source: "bill_upload" }), conn({ source: "smd" })]),
    ).toBe(false);
  });
});
