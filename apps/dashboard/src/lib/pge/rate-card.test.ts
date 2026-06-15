import { describe, expect, it } from "vitest";
import { planFor } from "@/lib/energy/rates";
import { loadRateCard } from "./rate-card";

describe("loadRateCard", () => {
  const card = loadRateCard();

  it("loads the committed fixture and covers every ag family at both size tiers", () => {
    for (const family of ["AG-A", "AG-B", "AG-C", "AG-4", "AG-5"]) {
      expect(planFor(card, family, "small")).not.toBeNull();
      expect(planFor(card, family, "large")).not.toBeNull();
    }
  });

  it("models AG-A with the bill-sourced max-demand charge (the real 2026 AGA1/AGA2 bills print one)", () => {
    const a2 = planFor(card, "AG-A", "large");
    expect(a2?.summer.demand.maxDemandPerKw ?? 0).toBeGreaterThan(0);
    // But never a peak-period demand charge - that is AG-C/AG-5 structure.
    expect(a2?.summer.demand.peakPeriodDemandPerKw ?? 0).toBe(0);
  });

  it("models AG-C with a max-demand AND a summer peak-period demand charge", () => {
    const c2 = planFor(card, "AG-C", "large");
    expect(c2?.summer.demand.maxDemandPerKw ?? 0).toBeGreaterThan(0);
    expect(c2?.summer.demand.peakPeriodDemandPerKw ?? 0).toBeGreaterThan(0);
    // The peak-period demand charge is summer-only.
    expect(c2?.winter.demand.peakPeriodDemandPerKw ?? 0).toBe(0);
  });

  it("flags AG-4 and AG-5 as legacy (valid source, never a target)", () => {
    expect(planFor(card, "AG-4", "large")?.legacy).toBe(true);
    expect(planFor(card, "AG-5", "large")?.legacy).toBe(true);
    expect(planFor(card, "AG-C", "large")?.legacy).toBe(false);
  });

  it("carries a dated, versioned, cited provenance down to the plan", () => {
    expect(card.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(card.version ?? "").not.toBe("");
    expect(card.source.length).toBeGreaterThan(0);
    for (const plan of card.plans) {
      expect(plan.customerChargePerDay ?? 0).toBeGreaterThan(0);
      expect(plan.sourceNote ?? "").not.toBe("");
    }
  });

  it("carries the published AG-C demand charge limiter", () => {
    expect(planFor(card, "AG-C", "small")?.demandChargeLimiterPerKwh).toBe(0.5);
    expect(planFor(card, "AG-C", "large")?.demandChargeLimiterPerKwh).toBe(0.5);
  });
});
