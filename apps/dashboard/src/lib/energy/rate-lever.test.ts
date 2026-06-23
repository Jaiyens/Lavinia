import { describe, expect, it } from "vitest";
import {
  BACK_TEST_BAND_PCT,
  backTestMeter,
  classifyUnmappedSchedule,
  costUnderPlanCents,
  cycleFromPeriod,
  mapScheduleLabel,
  planFromLabel,
  rateLever,
  touBucketForLabel,
  type LeverPeriod,
} from "./rate-lever";
import { priceCycleCents, type RateCard, type RatePlan } from "./rates";

// A hand-built card with simple prices so every expectation is hand-computable.
// Same shape discipline as rates.test.ts: the card is the only price source.
function plan(overrides: Partial<RatePlan> & Pick<RatePlan, "schedule" | "family" | "sizeClass">): RatePlan {
  return {
    legacy: false,
    agricultural: true,
    customerChargePerMonth: 30,
    customerChargePerDay: 1,
    summer: {
      energy: { peak: 0.4, partial_peak: 0.3, off_peak: 0.2 },
      demand: { maxDemandPerKw: 20 },
    },
    winter: {
      energy: { peak: 0.3, partial_peak: 0.25, off_peak: 0.15 },
      demand: { maxDemandPerKw: 20 },
    },
    ...overrides,
  };
}

const CARD: RateCard = {
  utility: "PG&E",
  effectiveDate: "2026-03-01",
  version: "test-1",
  source: "hand-built test card",
  summerMonths: [5, 6, 7, 8, 9, 10],
  sizeBreakKw: 35,
  plans: [
    plan({ schedule: "AG-A1", family: "AG-A", sizeClass: "small", customerChargePerDay: 0.5, winter: { energy: { peak: 0.35, partial_peak: 0.3, off_peak: 0.2 }, demand: { maxDemandPerKw: 12 } } }),
    plan({ schedule: "AG-A2", family: "AG-A", sizeClass: "large", customerChargePerDay: 0.7, winter: { energy: { peak: 0.25, partial_peak: 0.2, off_peak: 0.12 }, demand: { maxDemandPerKw: 21 } } }),
    plan({ schedule: "AG-B1", family: "AG-B", sizeClass: "small", customerChargePerDay: 0.9 }),
    plan({ schedule: "AG-B2", family: "AG-B", sizeClass: "large", customerChargePerDay: 0.9, winter: { energy: { peak: 0.3, partial_peak: 0.25, off_peak: 0.16 }, demand: { maxDemandPerKw: 14 } } }),
    plan({ schedule: "AG-C1", family: "AG-C", sizeClass: "small", customerChargePerDay: 1.4 }),
    plan({ schedule: "AG-C2", family: "AG-C", sizeClass: "large", customerChargePerDay: 1.4, demandChargeLimiterPerKwh: 0.5, winter: { energy: { peak: 0.28, partial_peak: 0.22, off_peak: 0.14 }, demand: { maxDemandPerKw: 25 } } }),
    plan({ schedule: "AG-4", family: "AG-4", sizeClass: "small", legacy: true, customerChargePerDay: 2.15 }),
    plan({ schedule: "AG-4", family: "AG-4", sizeClass: "large", legacy: true, customerChargePerDay: 2.15 }),
    plan({ schedule: "AG-5", family: "AG-5", sizeClass: "small", legacy: true, customerChargePerDay: 5.3, winter: { energy: { peak: 0.32, partial_peak: 0.28, off_peak: 0.18 }, demand: { maxDemandPerKw: 15 } } }),
    plan({ schedule: "AG-5", family: "AG-5", sizeClass: "large", legacy: true, customerChargePerDay: 1.2, winter: { energy: { peak: 0.33, partial_peak: 0.28, off_peak: 0.19 }, demand: { maxDemandPerKw: 20 } } }),
  ],
};

function winterPeriod(overrides: Partial<LeverPeriod> = {}): LeverPeriod {
  return {
    start: "2026-01-01T00:00:00.000Z",
    close: "2026-01-30T00:00:00.000Z",
    printedTotalCents: 10000,
    lineItems: [],
    ...overrides,
  };
}

describe("planFromLabel / mapScheduleLabel", () => {
  it("maps every real bill spelling, bare and descriptor-suffixed", () => {
    const cases: Array<[string, string]> = [
      ["AGA1", "AG-A1"],
      ["AGA1 Ag<35 kW Low Use", "AG-A1"],
      ["AGA2", "AG-A2"],
      ["AGA2 Ag<35 kW High Use", "AG-A2"],
      ["AGB Ag35+ kW Med Use", "AG-B2"],
      ["AGC Ag35+ kW High Use", "AG-C2"],
      ["AG5B", "AG-5"],
      ["AG5B Large Time-of-Use Agricultural Power", "AG-5"],
      ["AG5C", "AG-5"],
      ["AG5C Large Time-of-Use Agricultural Power", "AG-5"],
    ];
    for (const [label, schedule] of cases) {
      expect(planFromLabel(label, CARD, null)?.schedule, label).toBe(schedule);
    }
  });

  it("tiers AG5B large and AG5C small per the card provenance", () => {
    expect(planFromLabel("AG5B", CARD, null)?.sizeClass).toBe("large");
    expect(planFromLabel("AG5C", CARD, null)?.sizeClass).toBe("small");
  });

  it("tiers AG4C by billed demand against the card break", () => {
    expect(planFromLabel("AG4C", CARD, 10)?.sizeClass).toBe("small");
    expect(planFromLabel("AG4C", CARD, 80)?.sizeClass).toBe("large");
    // Unknown demand falls back small (the gate fails closed if it is wrong).
    expect(planFromLabel("AG4C", CARD, null)?.sizeClass).toBe("small");
  });

  it("normalizes case, whitespace, and hyphens", () => {
    expect(planFromLabel("  ag5c  ", CARD, null)?.schedule).toBe("AG-5");
    expect(planFromLabel("AG-A1", CARD, null)?.schedule).toBe("AG-A1");
  });

  it("returns null for non-ag and unknown labels", () => {
    expect(planFromLabel("B1 Bus Low Use", CARD, null)).toBeNull();
    expect(planFromLabel("E-19", CARD, null)).toBeNull();
    expect(planFromLabel("", CARD, null)).toBeNull();
  });

  it("recovers the H-prefixed AG spellings the export prints (HAGC->AG-C2 etc.)", () => {
    // The real Download-My-Data export prints the SmartRate/historical "H" prefix
    // on the bulk of Batth's ag meters (HAGC=85 SAs, HAGA2=19, HAGA1=14, HAGB=12,
    // HAG5B=1 = 131 SAs). They must map to the same plans as the bare codes.
    expect(planFromLabel("HAGC", CARD, null)?.schedule).toBe("AG-C2");
    expect(planFromLabel("HAGA2", CARD, null)?.schedule).toBe("AG-A2");
    expect(planFromLabel("HAGA1", CARD, null)?.schedule).toBe("AG-A1");
    expect(planFromLabel("HAGB", CARD, null)?.schedule).toBe("AG-B2");
    expect(planFromLabel("HAG5B", CARD, null)?.schedule).toBe("AG-5");
  });

  it("the H-strip never corrupts a non-ag H-code or an unfamilied AG code", () => {
    // HE1->E1, HB1->B1 (the bare B1 token, NOT the AGB key), HEM->EM: all stay null.
    expect(planFromLabel("HE1", CARD, null)).toBeNull();
    expect(planFromLabel("HB1", CARD, null)).toBeNull();
    expect(planFromLabel("HEM", CARD, null)).toBeNull();
    expect(planFromLabel("HETOUC", CARD, null)).toBeNull();
    // HAGFB->AGFB: ag-shaped but no FB family on the card -> null (fail closed).
    expect(planFromLabel("HAGFB", CARD, null)).toBeNull();
  });

  it("carries the REAL tier separate from the card row: AGA2 is a small schedule", () => {
    const mapped = mapScheduleLabel("AGA2 Ag<35 kW High Use", CARD, null);
    expect(mapped?.plan.schedule).toBe("AG-A2");
    expect(mapped?.plan.sizeClass).toBe("large"); // the card row it bills under
    expect(mapped?.realTier).toBe("small"); // the published <35 kW eligibility
  });
});

describe("classifyUnmappedSchedule", () => {
  it("tags the export's non-ag codes as non_ag (33 SAs across these codes)", () => {
    for (const code of ["A1X", "B1", "HB1", "HB6", "HE1", "HE1N", "HEM", "HETOUC", "HETOUCN", "E19P"]) {
      expect(classifyUnmappedSchedule(code), code).toBe("non_ag");
    }
  });

  it("tags an ag-shaped token with no card family as ag_no_card, never non_ag", () => {
    // HAGFB has no FB family on the card; it is an ag meter, not an intentional
    // non-ag exclusion, so it must NOT be rubber-stamped as non_ag.
    expect(classifyUnmappedSchedule("HAGFB")).toBe("ag_no_card");
    expect(classifyUnmappedSchedule("AGFB")).toBe("ag_no_card");
  });

  it("does not reach for recovered AG codes (they map, so are never classified)", () => {
    // Defensive: even if asked, an H-prefix AG code is ag-shaped (ag_no_card),
    // never silently non_ag. In practice mapScheduleLabel maps these first.
    for (const code of ["HAGC", "HAGA1", "HAGA2", "HAGB", "HAG5B"]) {
      expect(classifyUnmappedSchedule(code), code).not.toBe("non_ag");
    }
  });
});

describe("touBucketForLabel", () => {
  it("maps the ag bucket spellings and rejects the rest", () => {
    expect(touBucketForLabel("Peak")).toBe("peak");
    expect(touBucketForLabel("Off-Peak")).toBe("off_peak");
    expect(touBucketForLabel("Off Peak")).toBe("off_peak");
    expect(touBucketForLabel("Part-Peak")).toBe("partial_peak");
    expect(touBucketForLabel("Super Off-Peak")).toBeNull();
    expect(touBucketForLabel(null)).toBeNull();
  });
});

describe("cycleFromPeriod", () => {
  it("sums printed day counts across sub-periods and energy across split TOU rows", () => {
    const r = cycleFromPeriod(
      winterPeriod({
        lineItems: [
          { kind: "tou_energy", label: "Peak", amountCents: 100, quantity: 10, unit: "kWh", rate: 0.3 },
          { kind: "tou_energy", label: "Peak", amountCents: 50, quantity: 5, unit: "kWh", rate: 0.31 },
          { kind: "tou_energy", label: "Off-Peak", amountCents: 200, quantity: 100, unit: "kWh", rate: 0.15 },
          { kind: "other", label: "Customer Charge 01/01/2026 to 01/15/2026 15 days @ $1.19446", amountCents: 1792, quantity: null, unit: null, rate: null },
          { kind: "other", label: "Customer Charge 01/16/2026 to 01/30/2026 (15 days @ $1.19446)", amountCents: 1792, quantity: null, unit: null, rate: null },
        ],
      }),
      CARD,
    );
    expect("cycle" in r && r.cycle.days).toBe(30);
    expect("cycle" in r && r.cycle.energyKwh.peak).toBe(15);
    expect("cycle" in r && r.cycle.energyKwh.off_peak).toBe(100);
    expect("cycle" in r && r.cycle.season).toBe("winter");
  });

  it("falls back to the inclusive span when no day print parses", () => {
    const r = cycleFromPeriod(winterPeriod(), CARD);
    // Jan 01 .. Jan 30 inclusive = 30 days.
    expect("cycle" in r && r.cycle.days).toBe(30);
  });

  it("takes billed demand from the printed demand labels, max across sub-periods", () => {
    const r = cycleFromPeriod(
      winterPeriod({
        lineItems: [
          { kind: "other", label: "Demand Charge Max Demand (02/11-02/28) 244.320000 kW @$26.03000", amountCents: 381579, quantity: null, unit: null, rate: null },
          { kind: "other", label: "Max Demand 03/01-03/12 226.800000 kW @ $24.95000", amountCents: 220000, quantity: null, unit: null, rate: null },
          { kind: "demand", label: null, amountCents: 278322, quantity: 471.12, unit: "kW", rate: null },
        ],
      }),
      CARD,
    );
    // Label parse wins over the (sub-period-summed) demand-kind quantity.
    expect("cycle" in r && r.cycle.billedMaxKw).toBe(244.32);
  });

  it("falls back to the demand-kind quantity only when no label parses", () => {
    const r = cycleFromPeriod(
      winterPeriod({
        lineItems: [
          { kind: "demand", label: null, amountCents: 1312, quantity: 1.02, unit: "kW", rate: null },
        ],
      }),
      CARD,
    );
    expect("cycle" in r && r.cycle.billedMaxKw).toBe(1.02);
  });

  it("excludes credit cycles, zero totals, missing totals, invalid spans, and unmappable buckets with reasons", () => {
    const credit = cycleFromPeriod(winterPeriod({ printedTotalCents: -14911 }), CARD);
    expect("excluded" in credit && credit.excluded.reason).toBe("credit_cycle");

    // A $0 total is untestable: deviation against zero would always read as a
    // free pass and its recompute would inflate the savings base.
    const zero = cycleFromPeriod(winterPeriod({ printedTotalCents: 0 }), CARD);
    expect("excluded" in zero && zero.excluded.reason).toBe("zero_total");

    const missing = cycleFromPeriod(winterPeriod({ printedTotalCents: null }), CARD);
    expect("excluded" in missing && missing.excluded.reason).toBe("no_printed_total");

    // close before start (an extraction error) must exclude, never throw.
    const inverted = cycleFromPeriod(
      winterPeriod({ start: "2026-02-01T00:00:00.000Z", close: "2026-01-01T00:00:00.000Z" }),
      CARD,
    );
    expect("excluded" in inverted && inverted.excluded.reason).toBe("invalid_period");

    const weird = cycleFromPeriod(
      winterPeriod({
        lineItems: [
          { kind: "tou_energy", label: "Super Off-Peak", amountCents: 10, quantity: 1, unit: "kWh", rate: 0.1 },
        ],
      }),
      CARD,
    );
    expect("excluded" in weird && weird.excluded.reason).toBe("unmapped_energy_bucket");
  });

  it("rejects a partially parsed day print that undercounts the cycle", () => {
    // Only one of two sub-periods prints a day count (mixed label formats):
    // 12 days vs a 30-day span must fall back to the span, not bill 12 days.
    const r = cycleFromPeriod(
      winterPeriod({
        lineItems: [
          { kind: "other", label: "Customer Charge 01/19/2026 to 01/30/2026 (12 days @ $1.19446)", amountCents: 1433, quantity: null, unit: null, rate: null },
          { kind: "other", label: "Customer Charge 01/01/2026 to 01/18/2026", amountCents: 2150, quantity: null, unit: null, rate: null },
        ],
      }),
      CARD,
    );
    expect("cycle" in r && r.cycle.days).toBe(30);
  });
});

describe("backTestMeter", () => {
  const agc2 = CARD.plans.find((p) => p.schedule === "AG-C2");
  if (!agc2) throw new Error("test card is missing AG-C2");

  it("recomputes against the card and reports signed per-cycle deviation", () => {
    // 30 days @ 1.40 = 4200c; 100 kWh off-peak @ 0.14 = 1400c; 10 kW @ 25 = 25000c.
    const recomputed = priceCycleCents(
      { days: 30, season: "winter", energyKwh: { off_peak: 100 }, maxDemandKw: 10 },
      agc2,
    ).totalCents;
    expect(recomputed).toBe(4200 + 1400 + 25000);

    const cycle = {
      start: "2026-01-01T00:00:00.000Z",
      close: "2026-01-30T00:00:00.000Z",
      days: 30,
      season: "winter" as const,
      energyKwh: { off_peak: 100 },
      billedMaxKw: 10,
      printedTotalCents: 30600, // recompute = 30600 -> 0% deviation
    };
    const bt = backTestMeter([cycle], agc2);
    expect(bt.aggregateDeviationPct).toBe(0);
    expect(bt.perCycle[0]?.deviationPct).toBe(0);

    const hot = backTestMeter([{ ...cycle, printedTotalCents: 30000 }], agc2);
    expect(hot.perCycle[0]?.deviationPct).toBeCloseTo(2, 5);
    expect(hot.aggregateDeviationPct).toBeCloseTo(2, 5);
  });

  it("returns a null aggregate when nothing is testable", () => {
    expect(backTestMeter([], agc2).aggregateDeviationPct).toBeNull();
  });

  it("opposite-signed cycle errors do not cancel in the aggregate", () => {
    const base = {
      start: "2026-01-01T00:00:00.000Z",
      close: "2026-01-30T00:00:00.000Z",
      days: 30,
      season: "winter" as const,
      energyKwh: { off_peak: 100 },
      billedMaxKw: 10,
    };
    const recomputed = priceCycleCents(
      { days: 30, season: "winter", energyKwh: { off_peak: 100 }, maxDemandKw: 10 },
      agc2,
    ).totalCents;
    // One cycle prints 8% under the recompute, the other 8% over: the signed net
    // is ~0 but the model is wrong by ~8% on every bill - the aggregate must say so.
    const under = { ...base, printedTotalCents: Math.round(recomputed / 1.08) };
    const over = { ...base, printedTotalCents: Math.round(recomputed / 0.92) };
    const bt = backTestMeter([under, over], agc2);
    expect(bt.aggregateDeviationPct ?? 0).toBeGreaterThan(5);
    expect(bt.sumAbsErrorCents).toBeGreaterThan(0);
  });
});

// Builds a period whose printed total exactly equals the card recompute under
// `schedule`, so the gate passes at 0% deviation.
function exactPeriod(schedule: string, energy: { peak?: number; off_peak?: number }, demandKw: number | null): LeverPeriod {
  const p = CARD.plans.find((pl) => pl.schedule === schedule);
  if (!p) throw new Error(`no plan ${schedule}`);
  const total = priceCycleCents(
    { days: 30, season: "winter", energyKwh: energy, maxDemandKw: demandKw },
    p,
  ).totalCents;
  const lineItems: LeverPeriod["lineItems"] = [];
  if (energy.peak) lineItems.push({ kind: "tou_energy", label: "Peak", amountCents: 0, quantity: energy.peak, unit: "kWh", rate: null });
  if (energy.off_peak) lineItems.push({ kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: energy.off_peak, unit: "kWh", rate: null });
  if (demandKw !== null) lineItems.push({ kind: "other", label: `Max Demand 01/01-01/30 ${demandKw} kW @ $1.00000`, amountCents: 0, quantity: null, unit: null, rate: null });
  return winterPeriod({ printedTotalCents: total, lineItems });
}

describe("rateLever", () => {
  it("legacy meter passing the gate gets a dollar estimate against the cheapest eligible current schedule", () => {
    // AG5C (small legacy, $5.30/day) with usage; small candidates are AG-A1/AG-A2.
    const res = rateLever(
      { scheduleLabel: "AG5C", periods: [exactPeriod("AG-5", { peak: 50, off_peak: 200 }, 5)] },
      CARD,
    );
    expect(res.kind).toBe("estimate");
    if (res.kind !== "estimate") return;
    expect(res.isLegacy).toBe(true);
    expect(res.currentSchedule).toBe("AG-5");
    expect(["AG-A1", "AG-A2"]).toContain(res.targetSchedule);
    expect(res.savingsCents).toBeGreaterThan(0);
    expect(res.daysBasis).toBe(30);
    expect(res.aggregateDeviationPct).toBe(0);
    // The savings figure is exactly current-recompute minus best-candidate, in cents.
    expect(res.savingsCents).toBe(res.currentCostCents - res.targetCostCents);
  });

  it("legacy meter off the band falls back to qualitative with no dollar", () => {
    const period = exactPeriod("AG-5", { off_peak: 200 }, 5);
    const offBand = { ...period, printedTotalCents: Math.round((period.printedTotalCents ?? 0) * 1.2) };
    const res = rateLever({ scheduleLabel: "AG5C", periods: [offBand] }, CARD);
    expect(res).toMatchObject({ kind: "qualitative", isLegacy: true, reason: "off_band" });
  });

  it("non-legacy meter off the band gets NO finding (silence beats an unverified number)", () => {
    const period = exactPeriod("AG-C2", { off_peak: 200 }, 50);
    const offBand = { ...period, printedTotalCents: Math.round((period.printedTotalCents ?? 0) * 1.2) };
    const res = rateLever({ scheduleLabel: "AGC Ag35+ kW High Use", periods: [offBand] }, CARD);
    expect(res).toMatchObject({ kind: "none", isLegacy: false, reason: "off_band" });
  });

  it("legacy meter with no testable cycles is qualitative", () => {
    const res = rateLever({ scheduleLabel: "AG5B", periods: [] }, CARD);
    expect(res).toMatchObject({ kind: "qualitative", isLegacy: true, reason: "no_testable_cycles" });
    const credit = rateLever(
      { scheduleLabel: "AG5B", periods: [winterPeriod({ printedTotalCents: -100 })] },
      CARD,
    );
    expect(credit).toMatchObject({ kind: "qualitative", reason: "no_testable_cycles" });
    expect(credit.excluded).toHaveLength(1);
  });

  it("size ratchet: a 35+ meter only sees large candidates, never AG-A", () => {
    // AGC with heavy demand; cheapest large candidate is AG-B2 here.
    const res = rateLever(
      { scheduleLabel: "AGC Ag35+ kW High Use", periods: [exactPeriod("AG-C2", { peak: 100, off_peak: 1000 }, 100)] },
      CARD,
    );
    if (res.kind === "estimate") {
      expect(res.targetSchedule).toBe("AG-B2");
    } else {
      // AG-C2 may already be cheapest for this profile; then the honest answer is none.
      expect(res).toMatchObject({ kind: "none", reason: "no_savings" });
    }
  });

  it("size ratchet promotes a small-schedule meter whose billed demand crosses the break", () => {
    // AG5C (small legacy) but with 80 kW billed demand: candidates must be large.
    const res = rateLever(
      { scheduleLabel: "AG5C", periods: [exactPeriod("AG-5", { off_peak: 500 }, 80)] },
      CARD,
    );
    if (res.kind === "estimate") {
      expect(["AG-B2", "AG-C2"]).toContain(res.targetSchedule);
    } else {
      expect(res.kind).not.toBe("none");
    }
  });

  it("a current-schedule meter with zero tested usage stays silent (no idle-winter swaps)", () => {
    const res = rateLever(
      { scheduleLabel: "AGC Ag35+ kW High Use", periods: [exactPeriod("AG-C2", {}, 0.2)] },
      CARD,
    );
    expect(res).toMatchObject({ kind: "none", isLegacy: false, reason: "no_usage_basis" });
  });

  it("a legacy meter with zero usage still gets its finding (the closed-rate move holds year round)", () => {
    const res = rateLever({ scheduleLabel: "AG5C", periods: [exactPeriod("AG-5", {}, null)] }, CARD);
    // $5.30/day vs $0.50/day on AG-A1: a real, structural saving even idle.
    expect(res.kind).toBe("estimate");
    if (res.kind === "estimate") expect(res.targetSchedule).toBe("AG-A1");
  });

  it("a meter already on its cheapest schedule gets no finding", () => {
    // AG-A2 is the cheapest small plan for a high-use winter profile in this card
    // (its cheap energy beats AG-A1's lower day/demand rates at this volume).
    const res = rateLever(
      { scheduleLabel: "AGA2 Ag<35 kW High Use", periods: [exactPeriod("AG-A2", { peak: 100, off_peak: 5000 }, 10)] },
      CARD,
    );
    expect(res).toMatchObject({ kind: "none", isLegacy: false, reason: "no_savings" });
  });

  it("savings smaller than the model's own observed error are not quoted", () => {
    // The cycle prints 3% above the recompute (inside the 5% band), so the model
    // error is ~3% of the bill. Pick a profile where the candidate saving is
    // SMALLER than that error: the dollar must be withheld (qualitative, since
    // AG-5 is legacy).
    const period = exactPeriod("AG-5", { off_peak: 200 }, 5);
    const printed = period.printedTotalCents ?? 0;
    const drifted = { ...period, printedTotalCents: Math.round(printed * 1.03) };
    const res = rateLever({ scheduleLabel: "AG5C", periods: [drifted] }, CARD);
    if (res.kind === "estimate") {
      // If it still quotes, the savings must genuinely exceed the absolute error.
      expect(res.savingsCents).toBeGreaterThan(Math.round(printed * 0.03));
    } else {
      expect(res).toMatchObject({ kind: "qualitative", reason: "no_savings" });
    }
  });

  it("the ratchet reads demand from excluded cycles too", () => {
    // The only testable cycle shows no demand, but a credit cycle carries an
    // 80 kW print: the meter is large, so small candidates are off the table.
    const credit = winterPeriod({
      printedTotalCents: -500,
      lineItems: [
        { kind: "other", label: "Max Demand 01/01-01/30 80.000000 kW @ $14.90000", amountCents: 0, quantity: null, unit: null, rate: null },
      ],
    });
    const res = rateLever(
      { scheduleLabel: "AG5C", periods: [credit, exactPeriod("AG-5", { off_peak: 100 }, null)] },
      CARD,
    );
    if (res.kind === "estimate") {
      expect(["AG-B2", "AG-C2"]).toContain(res.targetSchedule);
    } else {
      expect(res.kind).toBe("qualitative");
    }
  });

  it("a summer cycle excludes peak-demand-charging candidates it cannot price", () => {
    // Summer cycle without a peak-window kW: AG-C2 (summer peak-period demand)
    // would be underpriced as a target, so the candidate set must skip it.
    const ag5Large = CARD.plans.find((p) => p.schedule === "AG-5" && p.sizeClass === "large");
    if (!ag5Large) throw new Error("missing AG-5 large");
    const printed = priceCycleCents(
      { days: 30, season: "summer", energyKwh: { off_peak: 500 }, maxDemandKw: 50 },
      ag5Large,
    ).totalCents;
    const summer: LeverPeriod = {
      start: "2026-07-01T00:00:00.000Z",
      close: "2026-07-30T00:00:00.000Z",
      printedTotalCents: printed,
      lineItems: [
        { kind: "tou_energy", label: "Off-Peak", amountCents: 0, quantity: 500, unit: "kWh", rate: null },
        { kind: "other", label: "Max Demand 07/01-07/30 50.000000 kW @ $20.54000", amountCents: 0, quantity: null, unit: null, rate: null },
      ],
    };
    const res = rateLever({ scheduleLabel: "AG5B", periods: [summer] }, CARD);
    if (res.kind === "estimate") {
      expect(res.targetSchedule).toBe("AG-B2"); // never AG-C2 without a peak-window kW
    } else {
      expect(res.kind).toBe("qualitative");
    }
  });

  it("unmapped and missing schedules yield none with isLegacy null", () => {
    expect(rateLever({ scheduleLabel: "B1 Bus Low Use", periods: [] }, CARD)).toMatchObject({
      kind: "none",
      isLegacy: null,
      reason: "unmapped_schedule",
      unmappedClass: "non_ag",
    });
    expect(rateLever({ scheduleLabel: null, periods: [] }, CARD)).toMatchObject({
      kind: "none",
      isLegacy: null,
      reason: "no_schedule",
    });
  });

  it("carries the sub-class on an unmapped result so exclusions read distinctly", () => {
    // A non-ag commercial schedule (HE1) vs an ag-shaped one with no card family
    // (HAGFB): both stay none, but the founder can tell them apart.
    expect(rateLever({ scheduleLabel: "HE1", periods: [] }, CARD)).toMatchObject({
      reason: "unmapped_schedule",
      unmappedClass: "non_ag",
    });
    expect(rateLever({ scheduleLabel: "HAGFB", periods: [] }, CARD)).toMatchObject({
      reason: "unmapped_schedule",
      unmappedClass: "ag_no_card",
    });
  });

  it("an H-prefixed AG meter now produces a real finding, not an unmapped none", () => {
    // HAGC is the largest cohort (85 SAs); before the H-strip it fell to NULL and
    // got no rate finding. It must now map and run the lever like bare AGC.
    const res = rateLever(
      { scheduleLabel: "HAGC", periods: [exactPeriod("AG-C2", { peak: 100, off_peak: 1000 }, 100)] },
      CARD,
    );
    expect(res.kind).not.toBe("none");
    if (res.kind === "estimate") {
      expect(res.currentSchedule).toBe("AG-C2");
    }
  });

  it("does not mutate its inputs", () => {
    const periods = [exactPeriod("AG-5", { peak: 50 }, 5)];
    const snapshot = JSON.parse(JSON.stringify(periods)) as unknown;
    rateLever({ scheduleLabel: "AG5C", periods }, CARD);
    expect(periods).toEqual(snapshot);
  });

  it("exposes the configured back-test band as the default (tightened to 3%)", () => {
    // The single source is back-test-config.ts (DEFAULT_BACK_TEST_BAND_PCT), re-exported here;
    // the historical 5% was loosened to a conservative 3%, founder-settable via env. Pricing is
    // unchanged - only the band a recompute may drift before a savings figure is trusted.
    expect(BACK_TEST_BAND_PCT).toBe(3);
  });
});

describe("costUnderPlanCents", () => {
  it("prices the same cycles under another plan, integer cents", () => {
    const agA1 = CARD.plans.find((p) => p.schedule === "AG-A1");
    if (!agA1) throw new Error("missing AG-A1");
    const r = cycleFromPeriod(exactPeriod("AG-5", { off_peak: 100 }, null), CARD);
    if (!("cycle" in r)) throw new Error("expected a cycle");
    // 30 days @ 0.50 = 1500c; 100 kWh @ 0.20 = 2000c.
    expect(costUnderPlanCents([r.cycle], agA1)).toBe(3500);
  });
});
