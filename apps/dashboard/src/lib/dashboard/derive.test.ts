import { describe, expect, it } from "vitest";
import { glance, heroes, type CyclePeriod, type RecLike } from "./derive";

describe("heroes", () => {
  const recs: RecLike[] = [
    { tool: "rate-optimization", severity: "act", impactUsd: 13000 },
    { tool: "rate-optimization", severity: "act", impactUsd: 4000 },
    { tool: "rate-optimization", severity: "watch", impactUsd: null }, // legacy fleet, no $
    { tool: "rate-optimization", severity: "info", impactUsd: 900 }, // low-confidence, excluded
    { tool: "demand-charge", severity: "act", impactUsd: 2300 },
    { tool: "bill-audit", severity: "act", impactUsd: 445 },
    { tool: "solar", severity: "watch", impactUsd: 1984 }, // neither hero
  ];

  it("sums material rate savings into the save hero, excluding low-confidence info recs", () => {
    expect(heroes(recs).saveUsd).toBe(17000);
    expect(heroes(recs).saveCount).toBe(2);
  });

  it("sums demand-charge and bill-audit dollars into the at-risk hero", () => {
    expect(heroes(recs).riskUsd).toBe(2745);
    expect(heroes(recs).riskCount).toBe(2);
  });

  it("counts every non-info finding as actionable", () => {
    // 2 rate act + 1 rate watch + 1 demand act + 1 audit act + 1 solar watch = 6
    expect(heroes(recs).actionableCount).toBe(6);
  });

  it("never inflates the heroes with solar findings", () => {
    const onlySolar: RecLike[] = [{ tool: "solar", severity: "watch", impactUsd: 5000 }];
    expect(heroes(onlySolar)).toMatchObject({ saveUsd: 0, riskUsd: 0 });
  });
});

describe("glance", () => {
  // Two months across two meters. May (latest) vs April (prev).
  const period = (
    close: string,
    totalBillUsd: number | null,
    totalKwh: number | null,
    gpm: number | null,
    horsepower: number | null,
  ): CyclePeriod => ({ close, totalBillUsd, totalKwh, gpm, horsepower });

  const periods: CyclePeriod[] = [
    period("2026-04-28", 1000, 5000, 1000, 100),
    period("2026-04-28", 2000, 8000, 1500, 150),
    period("2026-05-28", 1200, 5500, 1000, 100),
    period("2026-05-28", 2200, 8500, 1500, 150),
  ];

  it("sums the latest cycle's spend and trends it against the previous cycle", () => {
    const g = glance(periods);
    expect(g.spend.value).toBe(3400); // 1200 + 2200
    expect(g.spend.hasData).toBe(true);
    // (3400 - 3000) / 3000 = +13%
    expect(g.spend.trendPct).toBe(13);
  });

  it("sums electric usage from totalKwh", () => {
    expect(glance(periods).electric.value).toBe(14000); // 5500 + 8500
  });

  it("estimates water from energy and pump nameplate, and reports a trend", () => {
    const g = glance(periods);
    expect(g.water.value).toBeGreaterThan(0);
    expect(g.water.hasData).toBe(true);
    expect(g.water.trendPct).not.toBeNull();
  });

  it("reports no trend when there is only one cycle", () => {
    const one = [period("2026-05-28", 1200, 5500, 1000, 100)];
    expect(glance(one).spend.trendPct).toBeNull();
  });

  it("marks a metric with no contributing meter as having no data, not a fake zero", () => {
    // Summary-only meters: a spend but no kWh and no nameplate.
    const summaryOnly = [
      period("2026-04-28", 1000, null, null, null),
      period("2026-05-28", 1100, null, null, null),
    ];
    const g = glance(summaryOnly);
    expect(g.spend.hasData).toBe(true);
    expect(g.electric.hasData).toBe(false);
    expect(g.water.hasData).toBe(false);
  });
});
