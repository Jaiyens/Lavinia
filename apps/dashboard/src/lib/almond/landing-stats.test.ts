import { describe, expect, it } from "vitest";
import { computeLandingStats } from "./landing-stats";
import type { MeterView, MeterPeriodView } from "@/lib/dashboard/load";
import { toFindingViews, type FindingRow } from "@/lib/dashboard/findings";
import type { CoverageState } from "@/lib/recommendations/types";

// --- Fixtures -------------------------------------------------------------------------------------
// Meters mirror kpi.test.ts's minimal MeterView shape; findings are built through the real
// toFindingViews mapper (the same path the app uses) so the fixtures can never drift from the type.

function period(close: string, printedTotalCents: number | null): MeterPeriodView {
  return {
    start: close,
    close,
    printedTotalCents,
    demandCents: null,
    totalKwh: null,
    peakKw: null,
    tariff: "AGC",
    lineItems: [],
  };
}

function meter(
  id: string,
  coverageState: CoverageState,
  status: string | null,
  periods: MeterPeriodView[],
): MeterView {
  return {
    id,
    name: id,
    serviceId: id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status,
    coverageState,
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
    latitude: null,
    longitude: null,
    gpm: null,
    horsepower: null,
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
    periods,
  };
}

const FINDING_METERS = [{ id: "pump-1", name: "Lateral 3 Booster" }];

function findingRow(overrides: Partial<FindingRow>): FindingRow {
  return {
    id: "rec-1",
    tool: "rate-optimization",
    situation: "Lateral 3 Booster is billed on AG-C.",
    action: { kind: "switch_rate", label: "Move it to AG-A", params: { pumpId: "pump-1" } },
    impactUsd: 100,
    impactNote: null,
    severity: "act",
    status: "pending",
    result: null,
    ...overrides,
  };
}

describe("computeLandingStats", () => {
  it("sums savings as findingsAtRiskUsd (positive open-finding dollars, negatives floored at 0)", () => {
    const findings = toFindingViews(
      [
        findingRow({ id: "a", impactUsd: 1200, severity: "act" }),
        findingRow({ id: "b", impactUsd: 800.5, severity: "watch" }),
        findingRow({ id: "c", impactUsd: -500, severity: "info" }), // a credit-shaped finding does not deflate
      ],
      FINDING_METERS,
    );
    const stats = computeLandingStats({ meters: [], findings });
    expect(stats.savingsUsd).toBeCloseTo(2000.5);
  });

  it("counts meters at risk = BAD status OR needs_review coverage (deduped per meter)", () => {
    const stats = computeLandingStats({
      meters: [
        meter("good", "reconciled", "OK", [period("2026-03-12", 5000)]),
        meter("bad", "reconciled", "BAD", [period("2026-03-12", 5000)]), // flagged BAD
        meter("review", "needs_review", "OK", [period("2026-03-12", 9999)]), // unreconciled bill
        meter("both", "needs_review", "BAD", []), // BAD AND needs_review -> still ONE
        meter("blank", "no_bill", null, []),
      ],
      findings: [],
    });
    expect(stats.metersAtRisk).toBe(3);
  });

  it("takes last-month spend from the reconciled KPI strip (cents)", () => {
    const stats = computeLandingStats({
      meters: [
        meter("a", "reconciled", "OK", [period("2026-03-12", 10000)]),
        meter("b", "needs_review", "OK", [period("2026-03-12", 99999)]), // withheld from spend
      ],
      findings: [],
    });
    expect(stats.lastMonthSpendCents).toBe(10000);
  });

  it("normalizes a 0-cent / no-bill spend to null so the page renders 'Not on file'", () => {
    const stats = computeLandingStats({
      meters: [meter("a", "no_bill", null, [])],
      findings: [],
    });
    expect(stats.lastMonthSpendCents).toBeNull();
  });

  it("counts only 'act'-severity open findings as active alerts", () => {
    const findings = toFindingViews(
      [
        findingRow({ id: "a", severity: "act" }),
        findingRow({ id: "b", severity: "act" }),
        findingRow({ id: "c", severity: "watch" }),
        findingRow({ id: "d", severity: "info" }),
      ],
      FINDING_METERS,
    );
    const stats = computeLandingStats({ meters: [], findings });
    expect(stats.activeAlerts).toBe(2);
  });

  it("returns honest zeros / null for an empty farm", () => {
    const stats = computeLandingStats({ meters: [], findings: [] });
    expect(stats).toEqual({
      savingsUsd: 0,
      metersAtRisk: 0,
      lastMonthSpendCents: null,
      activeAlerts: 0,
    });
  });
});
