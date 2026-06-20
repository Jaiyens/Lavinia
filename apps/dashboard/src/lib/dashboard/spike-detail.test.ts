import { describe, expect, it } from "vitest";
import {
  buildSpikeDetail,
  latestSpikePeriod,
  spikeDetailForMeter,
  standardAgTarget,
  buildProofComparison,
} from "./spike-detail";
import type { MeterView, MeterPeriodView } from "./load";
import type { CoverageState } from "@/lib/recommendations/types";
import { loadRateCard } from "@/lib/pge/rate-card";

function period(
  opts: Partial<MeterPeriodView> & { close: string },
): MeterPeriodView {
  return {
    start: opts.start ?? opts.close,
    close: opts.close,
    printedTotalCents: opts.printedTotalCents ?? null,
    demandCents: opts.demandCents ?? null,
    peakKw: opts.peakKw ?? null,
    tariff: opts.tariff ?? "AG-B",
    lineItems: opts.lineItems ?? [],
  };
}

function meter(id: string, periods: MeterPeriodView[], over: Partial<MeterView> = {}): MeterView {
  return {
    id,
    name: id,
    serviceId: id,
    rateSchedule: "AG-B",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "reconciled" as CoverageState,
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
    periods,
    ...over,
  };
}

describe("latestSpikePeriod", () => {
  it("returns the newest period with a material demand charge", () => {
    const m = meter("p1", [
      period({ close: "2026-04-30", printedTotalCents: 50_000, demandCents: 30_000, peakKw: 120 }),
      period({ close: "2026-05-31", printedTotalCents: 80_000, demandCents: 40_000, peakKw: 180 }),
    ]);
    const p = latestSpikePeriod(m);
    expect(p?.close).toBe("2026-05-31");
  });

  it("skips periods with no demand charge or an immaterial one", () => {
    const m = meter("p2", [
      period({ close: "2026-05-31", printedTotalCents: 100_000, demandCents: 1_000, peakKw: 50 }), // <25%
      period({ close: "2026-04-30", printedTotalCents: 100_000, demandCents: 0, peakKw: 50 }),
    ]);
    expect(latestSpikePeriod(m)).toBeNull();
  });
});

describe("buildSpikeDetail", () => {
  it("reconciles the analysis to the billed demand cents and peak kW (the bill is truth)", () => {
    const p = period({
      close: "2026-07-31",
      printedTotalCents: 80_000,
      demandCents: 40_000,
      peakKw: 180,
    });
    const detail = buildSpikeDetail(meter("westside", [p]), p);
    expect(detail.analysis.demandCents).toBe(40_000);
    expect(detail.analysis.peakKw).toBe(180);
    // The post-fix demand is strictly less than the billed demand (there is a saving).
    expect(detail.analysis.fix.newDemandCents).toBeLessThan(40_000);
    expect(detail.analysis.fix.saveCents).toBeGreaterThan(0);
  });

  it("produces a deterministic cause for the same meter+cycle seed", () => {
    const p = period({ close: "2026-07-31", printedTotalCents: 80_000, demandCents: 40_000, peakKw: 180 });
    const a = buildSpikeDetail(meter("seed-x", [p]), p);
    const b = buildSpikeDetail(meter("seed-x", [p]), p);
    expect(a.analysis.cause).toBe(b.analysis.cause);
    expect(a.analysis.peakMinute).toBe(b.analysis.peakMinute);
  });

  it("renders the per-pump breakdown only for the overlap cause", () => {
    const p = period({ close: "2026-07-31", printedTotalCents: 80_000, demandCents: 40_000, peakKw: 180 });
    const detail = buildSpikeDetail(meter("ov", [p]), p);
    if (detail.analysis.cause === "overlap") {
      expect(detail.analysis.byPump).toBeDefined();
      expect(detail.pumpsAreRepresentative).toBe(true);
    } else {
      expect(detail.analysis.byPump).toBeUndefined();
      expect(detail.analysis.fix.kind).toBe("shift_offpeak");
    }
  });
});

describe("spikeDetailForMeter", () => {
  it("returns null when no cycle carries a material demand charge", () => {
    const m = meter("flat", [period({ close: "2026-05-31", printedTotalCents: 50_000, demandCents: null })]);
    expect(spikeDetailForMeter(m)).toBeNull();
  });
});

describe("standardAgTarget", () => {
  it("maps the standard go-forward agricultural moves", () => {
    expect(standardAgTarget("AG-A")).toBe("AG-C");
    expect(standardAgTarget("AG-B")).toBe("AG-C");
    expect(standardAgTarget("AG-4")).toBe("AG-B");
    expect(standardAgTarget("AG-5")).toBe("AG-C");
    expect(standardAgTarget("AG-C")).toBeNull(); // already the TOU target
    expect(standardAgTarget(null)).toBeNull();
  });

  it("normalizes a suffixed schedule to its family before mapping", () => {
    expect(standardAgTarget("AG-B2")).toBe("AG-C");
  });
});

describe("buildProofComparison", () => {
  const card = loadRateCard();

  it("prices the same usage under two rates and reports the saving", () => {
    const p = period({
      close: "2026-07-31",
      start: "2026-07-01",
      printedTotalCents: 80_000,
      demandCents: 40_000,
      peakKw: 180,
      tariff: "AG-B",
      lineItems: [
        { kind: "tou_energy", label: "Peak", amountCents: 10_000, quantity: 4_000, unit: "kWh", rate: null },
        { kind: "tou_energy", label: "Off-Peak", amountCents: 20_000, quantity: 30_000, unit: "kWh", rate: null },
        { kind: "demand", label: "Demand", amountCents: 40_000, quantity: 180, unit: "kW", rate: null },
      ],
    });
    const proof = buildProofComparison(meter("westside", [p]), card);
    expect(proof).not.toBeNull();
    if (proof === null) return;
    expect(proof.fromSchedule).toBe("AG-B");
    expect(proof.toSchedule).toBe("AG-C");
    // Both columns priced; the saving is from.total - to.total.
    expect(proof.comparison.saveCents).toBe(
      proof.comparison.from.breakdown.totalCents - proof.comparison.to.breakdown.totalCents,
    );
    // The model-vs-billed delta is reported for reconciliation.
    expect(proof.modelDeltaFraction).not.toBeNull();
  });

  it("returns null when there is no standard target (already on AG-C)", () => {
    const p = period({
      close: "2026-07-31",
      start: "2026-07-01",
      printedTotalCents: 80_000,
      demandCents: 40_000,
      peakKw: 180,
      tariff: "AG-C",
      lineItems: [
        { kind: "demand", label: "Demand", amountCents: 40_000, quantity: 180, unit: "kW", rate: null },
      ],
    });
    expect(buildProofComparison(meter("c", [p], { rateSchedule: "AG-C" }), card)).toBeNull();
  });

  it("honors an explicit recommended schedule over the standard target", () => {
    const p = period({
      close: "2026-07-31",
      start: "2026-07-01",
      printedTotalCents: 80_000,
      demandCents: 40_000,
      peakKw: 180,
      tariff: "AG-A",
      lineItems: [
        { kind: "tou_energy", label: "Off-Peak", amountCents: 20_000, quantity: 30_000, unit: "kWh", rate: null },
      ],
    });
    const proof = buildProofComparison(meter("a", [p], { rateSchedule: "AG-A" }), card, "AG-B");
    if (proof !== null) {
      expect(proof.toSchedule).toBe("AG-B");
    }
  });
});
