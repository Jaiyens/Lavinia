import { describe, expect, it } from "vitest";
import { refundFindingForMeter, refundFindings } from "./refund-finding";
import type { MeterView, MeterPeriodView } from "./load";
import type { CoverageState } from "@/lib/recommendations/types";
import { loadRateCard } from "@/lib/pge/rate-card";

function period(over: Partial<MeterPeriodView> & { close: string }): MeterPeriodView {
  return {
    start: over.start ?? over.close,
    close: over.close,
    printedTotalCents: over.printedTotalCents ?? null,
    demandCents: over.demandCents ?? null,
    totalKwh: over.totalKwh ?? null,
    peakKw: over.peakKw ?? null,
    tariff: over.tariff ?? null,
    lineItems: over.lineItems ?? [],
  };
}

function meter(id: string, rateSchedule: string, periods: MeterPeriodView[]): MeterView {
  return {
    id,
    name: id,
    serviceId: id,
    rateSchedule,
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
  };
}

const card = loadRateCard();

// A pump-sized cycle on a commercial rate: a large peak (>= 20 kW so it classifies as a pump)
// and a printed total ABOVE what the correct ag rate would have charged the same usage, so
// there is recoverable overpayment. The commercial demand rate overcharges the pump's peak.
function commercialPumpCycle(close: string): MeterPeriodView {
  return period({
    close,
    start: `${close.slice(0, 7)}-01`,
    tariff: "B-19",
    peakKw: 150,
    // The real AG-B re-price of 40,000 off-peak kWh + a 150 kW summer peak lands near
    // $16.5k; a commercial rate billing well above that is the overpayment being recovered.
    printedTotalCents: 2_500_000, // $25,000 commercial bill
    demandCents: 1_500_000,
    lineItems: [
      { kind: "tou_energy", label: "Off-Peak", amountCents: 1_000_000, quantity: 40_000, unit: "kWh", rate: null },
      { kind: "demand", label: "Demand", amountCents: 1_500_000, quantity: 150, unit: "kW", rate: null },
    ],
  });
}

describe("refundFindingForMeter", () => {
  it("flags a pump-sized meter billed on a commercial B rate as a possible refund", () => {
    const m = meter("pump-on-b19", "B-19", [
      commercialPumpCycle("2026-05-31"),
      commercialPumpCycle("2026-04-30"),
    ]);
    const finding = refundFindingForMeter(m, card);
    expect(finding).not.toBeNull();
    if (finding === null) return;
    expect(finding.billedTariff).toBe("B-19");
    expect(finding.recoverableCents).toBeGreaterThan(0);
    // Floored to whole dollars.
    expect(finding.recoverableCents % 100).toBe(0);
  });

  it("does not flag a meter already on an agricultural rate", () => {
    const m = meter("ag-pump", "AG-B", [commercialPumpCycle("2026-05-31")]);
    expect(refundFindingForMeter(m, card)).toBeNull();
  });

  it("does not flag a small, office-sized commercial meter (a genuine non-pump)", () => {
    // Small peak (< 8 kW): classifies as a non-pump, so no refund even on a commercial rate.
    // This is the demo's B-1 office case.
    const m = meter("office", "B-1", [
      period({
        close: "2026-05-31",
        start: "2026-05-01",
        tariff: "B-1",
        peakKw: 7,
        printedTotalCents: 9_000,
        lineItems: [
          { kind: "tou_energy", label: "Off-Peak", amountCents: 9_000, quantity: 600, unit: "kWh", rate: null },
        ],
      }),
    ]);
    expect(refundFindingForMeter(m, card)).toBeNull();
  });
});

describe("refundFindings", () => {
  it("returns an empty array when no meter qualifies (the demo data case)", () => {
    const meters = [
      meter("ag-1", "AG-C", [commercialPumpCycle("2026-05-31")]),
      meter("office", "B-1", [
        period({ close: "2026-05-31", start: "2026-05-01", tariff: "B-1", peakKw: 6, printedTotalCents: 8_000 }),
      ]),
    ];
    expect(refundFindings(meters, card)).toEqual([]);
  });
});
