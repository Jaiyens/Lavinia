import { describe, expect, it } from "vitest";
import { loadRateCard } from "@/lib/pge/rate-card";
import { modelFarmSpend, modelMeterCost, touPeriodForCode } from "./modeled-cost";
import type { IntervalReading } from "./types";

const card = loadRateCard();

/** Build a run of 15-min readings starting at a UTC instant, one kWh each. */
function run(
  startIso: string,
  touCode: string,
  kwhs: number[],
  direction: "import" | "export" = "import",
): IntervalReading[] {
  const base = new Date(startIso).getTime();
  return kwhs.map((kWh, i) => ({
    start: new Date(base + i * 15 * 60_000).toISOString(),
    durationSec: 900,
    kWh,
    direction,
    touCode,
  }));
}

describe("touPeriodForCode", () => {
  it("maps summer + winter PG&E codes to card buckets", () => {
    expect(touPeriodForCode("SPK")).toBe("peak");
    expect(touPeriodForCode("WPK")).toBe("peak");
    expect(touPeriodForCode("SPP")).toBe("partial_peak");
    expect(touPeriodForCode("WPP")).toBe("partial_peak");
    expect(touPeriodForCode("SOP")).toBe("off_peak");
    expect(touPeriodForCode("WOP")).toBe("off_peak");
    expect(touPeriodForCode("WSO")).toBe("off_peak");
    expect(touPeriodForCode("")).toBeNull();
    expect(touPeriodForCode(null)).toBeNull();
  });
});

describe("modelMeterCost", () => {
  it("prices an AG-C meter: buckets energy by TOU code, demand from 15-min peak", () => {
    // 2 peak intervals (10 + 5 kWh) + 2 off-peak (4 + 4) in summer.
    const intervals = [
      ...run("2025-07-01T00:00:00Z", "SPK", [10, 5]),
      ...run("2025-07-01T00:30:00Z", "SOP", [4, 4]),
    ];
    const m = modelMeterCost("sa1", "HAGC", intervals, card);
    expect(m.priced).toBe(true);
    expect(m.season).toBe("summer");
    expect(m.family).toBe("AG-C");
    expect(m.energyKwh.peak).toBe(15);
    expect(m.energyKwh.off_peak).toBe(8);
    expect(m.totalImportKwh).toBe(23);
    // Highest 15-min kW = 10 kWh / 0.25h = 40 kW; the peak-window peak is the same 40.
    expect(m.maxDemandKw).toBe(40);
    expect(m.peakWindowDemandKw).toBe(40);
    // Components reconcile to the total, and a real summer AG-C bill is non-trivial.
    const b = m.breakdown;
    expect(b.customerCents + b.energyCents + b.demandCents).toBe(b.totalCents);
    expect(b.totalCents).toBeGreaterThan(0);
    expect(b.demandCents).toBeGreaterThan(0); // AG-C carries demand + peak-period demand
  });

  it("separates export (solar) kWh from priced import energy", () => {
    const intervals = [
      ...run("2025-07-01T00:00:00Z", "SOP", [6, 6]),
      ...run("2025-07-01T00:00:00Z", "SOP", [2, 2], "export"),
    ];
    const m = modelMeterCost("sa2", "HAGC", intervals, card);
    expect(m.totalImportKwh).toBe(12);
    expect(m.exportKwh).toBe(4);
    expect(m.energyKwh.off_peak).toBe(12); // export not counted as consumption
  });

  it("leaves a commercial schedule UNPRICED rather than guessing", () => {
    const m = modelMeterCost("sa3", "B1", run("2025-07-01T00:00:00Z", "SOP", [5, 5]), card);
    expect(m.priced).toBe(false);
    expect(m.reason).toMatch(/rate not loaded/);
    expect(m.monthlyCents).toBe(0);
  });

  it("returns no-usage when there are no import intervals", () => {
    const m = modelMeterCost("sa4", "HAGC", run("2025-07-01T00:00:00Z", "SOP", [1], "export"), card);
    expect(m.priced).toBe(false);
    expect(m.reason).toBe("no usage in window");
  });
});

describe("modelFarmSpend", () => {
  it("rolls modeled monthly spend up by account and counts unpriced meters", () => {
    const meters = [
      { serviceId: "a", rateCode: "HAGC", accountNumber: "100", intervals: run("2025-07-01T00:00:00Z", "SOP", [8, 8]) },
      { serviceId: "b", rateCode: "AG5B", accountNumber: "100", intervals: run("2025-07-01T00:00:00Z", "SPK", [9, 9]) },
      { serviceId: "c", rateCode: "B1", accountNumber: "200", intervals: run("2025-07-01T00:00:00Z", "SOP", [5, 5]) },
    ];
    const report = modelFarmSpend(meters, card);
    expect(report.totals.meters).toBe(3);
    expect(report.totals.pricedMeters).toBe(2); // HAGC + AG5B priced; B1 not
    expect(report.totals.unpricedMeters).toBe(1);
    const acct100 = report.byAccount.find((a) => a.accountNumber === "100")!;
    expect(acct100.pricedMeters).toBe(2);
    expect(acct100.monthlyCents).toBeGreaterThan(0);
    const acct200 = report.byAccount.find((a) => a.accountNumber === "200")!;
    expect(acct200.pricedMeters).toBe(0);
    expect(acct200.monthlyCents).toBe(0);
  });
});
