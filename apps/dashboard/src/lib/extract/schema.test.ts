import { describe, expect, it } from "vitest";
import {
  NemReconciliationSchema,
  PageTypeSchema,
  type PerSaChargeDetail,
  PerSaChargeDetailSchema,
  RawPageSchema,
} from "./schema";

describe("PerSaChargeDetailSchema, the charge-detail RawExtraction", () => {
  const valid: PerSaChargeDetail = {
    pageType: "per_sa_charge_detail",
    saId: "1007066742",
    meterNumber: "M-8841",
    growerPumpId: "P001",
    rateName: "AG-5B",
    serviceStart: "2026-03-01",
    serviceEnd: "2026-03-31",
    cycleClose: "2026-03-31",
    touEnergy: [
      { period: "Peak", kWh: 1234.567891, rate: 0.41327, amountCents: 51012 },
      { period: "Part-Peak", kWh: 800.0, rate: 0.29011, amountCents: 23209 },
      { period: "Off-Peak", kWh: 4200.5, rate: 0.18004, amountCents: 75626 },
    ],
    demandKw: 47.2,
    demandAmountCents: 88100,
    nbcLineItems: [{ label: "PCIA", amountCents: 4210 }],
    otherLineItems: [{ label: "Customer Charge", amountCents: 3500 }],
    printedTotalCents: 245657,
  };

  it("accepts a valid three-tier (legacy Part-Peak) charge detail", () => {
    const parsed = PerSaChargeDetailSchema.parse(valid);
    expect(parsed.touEnergy).toHaveLength(3);
    expect(parsed.printedTotalCents).toBe(245657);
  });

  it("accepts a current two-tier split (no Part-Peak)", () => {
    const twoTier = {
      ...valid,
      touEnergy: [valid.touEnergy[0]!, valid.touEnergy[2]!],
    };
    expect(PerSaChargeDetailSchema.parse(twoTier).touEnergy).toHaveLength(2);
  });

  it("rejects a non-integer cents amount (cents must be whole)", () => {
    const bad = { ...valid, printedTotalCents: 245657.5 };
    expect(PerSaChargeDetailSchema.safeParse(bad).success).toBe(false);
  });
});

describe("NemReconciliationSchema, negative usage is captured not floored (FR-3)", () => {
  it("accepts a negative kWh month (over-production)", () => {
    const parsed = NemReconciliationSchema.parse({
      pageType: "nem_reconciliation",
      saId: "1010898065",
      monthlyRows: [
        { periodStart: "2026-04-01", periodEnd: "2026-04-30", kWh: -1820.5, amountCents: null },
      ],
      trueUpMonth: 4,
      trueUpDate: "2026-04-18",
      trueUpAmountCents: -120033,
    });
    expect(parsed.monthlyRows[0]!.kWh).toBeLessThan(0);
  });
});

describe("RawPageSchema discriminated union + PageType", () => {
  it("enumerates the five PG&E page types", () => {
    expect(PageTypeSchema.options).toEqual([
      "payment_confirmation",
      "account_summary",
      "per_sa_summary_list",
      "per_sa_charge_detail",
      "nem_reconciliation",
    ]);
  });

  it("routes a page by its pageType discriminant", () => {
    const page = RawPageSchema.parse({ pageType: "account_summary", accountNumber: "07302408880", printedTotalCents: 1172733 });
    expect(page.pageType).toBe("account_summary");
  });
});
