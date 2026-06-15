import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PerSaChargeDetailSchema } from "@/lib/extract/schema";
import { type BillInventoryView, normalizeBill } from "./billing";

// The realistic charge-detail fixture, validated through the Story 1.3 schema so the
// normalize test operates on the same shape the pipeline produces.
const rawBill = PerSaChargeDetailSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "fixtures/extract/sample-charge-detail.json"), "utf8")),
);

// An inventory whose row matches the fixture's SA ID, meter #, and Pump ID.
const inventory: BillInventoryView = {
  meters: [
    { saId: "1007066742", meterSerial: "M-8841", growerPumpId: "P001" },
    { saId: "1009111222", meterSerial: "M-2000", growerPumpId: "P002" },
  ],
};

describe("normalizeBill, raw charge detail -> canonical bill (AC1)", () => {
  it("maps the printed service period, integer-cents line items, and the TOU split", () => {
    const bill = normalizeBill(rawBill, inventory);
    const period = bill.periods[0];
    if (!period) throw new Error("expected one canonical period");

    // Period dates come from the printed service period, never fabricated.
    expect(period.start).toBe("2026-02-01");
    expect(period.close).toBe("2026-02-28");
    expect(period.cycleClose).toBe("2026-02-28");
    expect(period.tariff).toBe("AG-5B");

    // Three-tier legacy TOU is flagged and the split carried.
    expect(period.isLegacyTou).toBe(true);
    expect(period.touSplit).toHaveLength(3);

    // Every charge composing the printed total is a line item (tou x3 + demand + nbc + other).
    expect(period.lineItems).toHaveLength(6);
    const kinds = period.lineItems.map((li) => li.kind);
    expect(kinds.filter((k) => k === "tou_energy")).toHaveLength(3);
    expect(kinds).toContain("demand");
    expect(kinds).toContain("nbc");
    expect(kinds).toContain("other");

    // Reconcile target is coherent for Story 1.7: line items sum to the printed total.
    const sum = period.lineItems.reduce((acc, li) => acc + li.amountCents, 0);
    expect(sum).toBe(period.printedTotalCents);
    expect(period.printedTotalCents).toBe(245657);
  });

  it("carries demand kW/cents onto the period and as a kW line item", () => {
    const bill = normalizeBill(rawBill, inventory);
    const period = bill.periods[0]!;
    expect(period.demandKw).toBe(47.2);
    expect(period.demandAmountCents).toBe(88100);
    const demand = period.lineItems.find((li) => li.kind === "demand");
    if (!demand) throw new Error("expected a demand line item");
    expect(demand.unit).toBe("kW");
    expect(demand.quantity).toBe(47.2);
    expect(demand.amountCents).toBe(88100);
  });

  it("omits the demand line item when no demand was billed", () => {
    const noDemand = { ...rawBill, demandKw: null, demandAmountCents: null };
    const period = normalizeBill(noDemand, inventory).periods[0]!;
    expect(period.lineItems.some((li) => li.kind === "demand")).toBe(false);
    expect(period.demandAmountCents).toBeNull();
  });
});

describe("normalizeBill SA-ID normalization + descriptor preservation (AC2)", () => {
  it("strips a P0xx descriptor, joins on the core SA ID, and preserves the descriptor", () => {
    const withSuffix = { ...rawBill, saId: "1007066742 P001" };
    const bill = normalizeBill(withSuffix, inventory);
    expect(bill.saId).toBe("1007066742");
    expect(bill.saIdDescriptor).toBe("P001");
    expect(bill.periods[0]!.saId).toBe("1007066742");
    // The join still resolves on the core id -> clean attach.
    expect(bill.periods[0]!.coverageState).toBe("no_bill");
  });
});

describe("normalizeBill identity-checked join (AC3)", () => {
  it("attaches cleanly when SA ID + meter # + Pump ID all agree", () => {
    expect(normalizeBill(rawBill, inventory).periods[0]!.coverageState).toBe("no_bill");
  });

  it("flags needs_review when the extracted meter # disagrees with inventory", () => {
    const wrongMeter = { ...rawBill, meterNumber: "M-DIFFERENT" };
    expect(normalizeBill(wrongMeter, inventory).periods[0]!.coverageState).toBe("needs_review");
  });

  it("flags needs_review when the extracted Pump ID disagrees with inventory", () => {
    const wrongPump = { ...rawBill, growerPumpId: "P999" };
    expect(normalizeBill(wrongPump, inventory).periods[0]!.coverageState).toBe("needs_review");
  });

  it("flags needs_review when the SA ID matches no inventory row", () => {
    const orphan = { ...rawBill, saId: "0000000000" };
    expect(normalizeBill(orphan, inventory).periods[0]!.coverageState).toBe("needs_review");
  });

  it("does NOT treat an absent (null) extracted identifier as a mismatch", () => {
    // SA ID matches; meter # and Pump ID not printed -> SA-ID-only confidence is a clean attach.
    const noIds = { ...rawBill, meterNumber: null, growerPumpId: null };
    expect(normalizeBill(noIds, inventory).periods[0]!.coverageState).toBe("no_bill");
  });

  it("never links on a blank SA ID (data-fidelity)", () => {
    const blank = { ...rawBill, saId: "   " };
    const bill = normalizeBill(blank, inventory);
    expect(bill.saId).toBe("");
    expect(bill.periods[0]!.coverageState).toBe("needs_review");
  });

  it("matches an inventory row whose SA-ID column carries a descriptor (symmetric normalize)", () => {
    // Grower sheets often put a P0xx descriptor in the SA-ID column; both sides are
    // normalized to the core so a legitimate meter is not falsely flagged needs_review.
    const descriptorInventory: BillInventoryView = {
      meters: [{ saId: "1007066742 P001", meterSerial: "M-8841", growerPumpId: "P001" }],
    };
    expect(normalizeBill(rawBill, descriptorInventory).periods[0]!.coverageState).toBe("no_bill");
  });

  it("flags needs_review when the SA ID is ambiguous across duplicate inventory rows", () => {
    const dupes: BillInventoryView = {
      meters: [
        { saId: "1007066742", meterSerial: "M-8841", growerPumpId: "P001" },
        { saId: "1007066742", meterSerial: "M-OTHER", growerPumpId: "P099" },
      ],
    };
    expect(normalizeBill(rawBill, dupes).periods[0]!.coverageState).toBe("needs_review");
  });

  it("does not false-reject on whitespace noise in the meter # or Pump ID", () => {
    const noisy = { ...rawBill, meterNumber: "M-8841 ", growerPumpId: " P001" };
    expect(normalizeBill(noisy, inventory).periods[0]!.coverageState).toBe("no_bill");
  });

  it("treats a null inventory identifier as missing data, not a contradiction", () => {
    // Inventory lacks a recorded meter serial; the bill prints one. SA-ID match stands.
    const sparseInventory: BillInventoryView = {
      meters: [{ saId: "1007066742", meterSerial: null, growerPumpId: null }],
    };
    expect(normalizeBill(rawBill, sparseInventory).periods[0]!.coverageState).toBe("no_bill");
  });
});

describe("normalizeBill source-swap seam (AC4)", () => {
  it("returns only canonical fields - no raw page type or extraction-only field leaks", () => {
    const bill = normalizeBill(rawBill, inventory);
    // A future Bayou->canonical adapter targets this same shape; nothing source-specific here.
    expect(Object.keys(bill).sort()).toEqual(
      ["growerPumpId", "meterNumber", "periods", "saId", "saIdDescriptor"].sort(),
    );
    expect("pageType" in bill).toBe(false);
    const period = bill.periods[0]!;
    expect("pageType" in period).toBe(false);
    expect("nbcLineItems" in period).toBe(false);
  });
});
