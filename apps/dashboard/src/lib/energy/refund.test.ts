import { describe, expect, it } from "vitest";
import {
  estimateRefund,
  isCommercialTariff,
  REFUND_LOOKBACK_MONTHS,
  type RefundCycle,
} from "./refund";

describe("isCommercialTariff", () => {
  it("recognizes the commercial B rate classes", () => {
    expect(isCommercialTariff("B-1")).toBe(true);
    expect(isCommercialTariff("B-19")).toBe(true);
    expect(isCommercialTariff("B-19S")).toBe(true);
    expect(isCommercialTariff("B-20")).toBe(true);
    expect(isCommercialTariff("b-1")).toBe(true); // case-insensitive
  });

  it("does NOT treat agricultural rates (including AG-B) as commercial", () => {
    expect(isCommercialTariff("AG-B")).toBe(false);
    expect(isCommercialTariff("AG-C")).toBe(false);
    expect(isCommercialTariff("AG-4")).toBe(false);
  });

  it("returns false for empty / null / unknown", () => {
    expect(isCommercialTariff(null)).toBe(false);
    expect(isCommercialTariff(undefined)).toBe(false);
    expect(isCommercialTariff("")).toBe(false);
    expect(isCommercialTariff("E-19")).toBe(false);
  });
});

function cycle(close: string, billedCents: number, agCostCents: number, months = 1): RefundCycle {
  return { close, billedCents, agCostCents, months };
}

describe("estimateRefund", () => {
  it("qualifies a pump billed on a commercial rate and sums overpayment, floored to dollars", () => {
    const result = estimateRefund({
      classification: "pump",
      billedTariff: "B-19",
      cycles: [
        cycle("2026-05-31", 120_055, 90_000), // overpaid 30,055c
        cycle("2026-04-30", 110_099, 95_000), // overpaid 15,099c
      ],
    });
    expect(result.qualifies).toBe(true);
    // 30,055 + 15,099 = 45,154c -> floor to whole dollars = 45,100c ($451)
    expect(result.recoverableCents).toBe(45_100);
    expect(result.billedTariff).toBe("B-19");
    expect(result.cyclesCounted).toBe(2);
    expect(result.reason).toBe("qualifies");
  });

  it("does not qualify a non-pump on a commercial rate (a real office, not a misrate)", () => {
    const result = estimateRefund({
      classification: "non_pump",
      billedTariff: "B-1",
      cycles: [cycle("2026-05-31", 100_000, 50_000)],
    });
    expect(result.qualifies).toBe(false);
    expect(result.recoverableCents).toBe(0);
    expect(result.reason).toBe("not_a_pump");
  });

  it("does not qualify a pump already on an agricultural rate (that is a switch, not a refund)", () => {
    const result = estimateRefund({
      classification: "pump",
      billedTariff: "AG-B",
      cycles: [cycle("2026-05-31", 100_000, 90_000)],
    });
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("not_commercial");
  });

  it("skips cycles where the ag rate would have cost MORE (never nets the claim down)", () => {
    const result = estimateRefund({
      classification: "pump",
      billedTariff: "B-1",
      cycles: [
        cycle("2026-05-31", 200_000, 100_000), // overpaid 100,000c
        cycle("2026-04-30", 80_000, 120_000), // ag would cost MORE: contributes 0
      ],
    });
    expect(result.qualifies).toBe(true);
    expect(result.recoverableCents).toBe(100_000);
  });

  it("caps the look-back at 36 months", () => {
    const cycles: RefundCycle[] = [];
    for (let m = 0; m < 48; m += 1) {
      // Each cycle overpays $100 (10,000c); only the newest 36 should count.
      cycles.push(cycle(`2026-${String((m % 12) + 1).padStart(2, "0")}-${10 + m}`, 110_000, 100_000));
    }
    const result = estimateRefund({ classification: "pump", billedTariff: "B-1", cycles });
    expect(result.cyclesCounted).toBe(REFUND_LOOKBACK_MONTHS);
    expect(result.recoverableCents).toBe(REFUND_LOOKBACK_MONTHS * 10_000);
  });

  it("returns no_cycles when there is no trailing data", () => {
    const result = estimateRefund({ classification: "pump", billedTariff: "B-1", cycles: [] });
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("no_cycles");
  });

  it("returns no_overpayment when commercial never overcharged", () => {
    const result = estimateRefund({
      classification: "pump",
      billedTariff: "B-1",
      cycles: [cycle("2026-05-31", 90_000, 100_000)],
    });
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe("no_overpayment");
    expect(result.recoverableCents).toBe(0);
  });
});
