import { describe, expect, it } from "vitest";
import type { IntervalReading } from "./types";
import { type MeterSignature, classifyMeter, meterSignature } from "./classify";

// A 15-minute reading at a given UTC hour (and optional minute) on a fixed day.
// kW is kWh * 4.
function r(hourUtc: number, kWh: number, minute = 0): IntervalReading {
  const hh = String(hourUtc).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return { start: `2026-07-01T${hh}:${mm}:00.000Z`, durationSec: 900, kWh };
}

describe("meterSignature", () => {
  it("derives peak, average, and load factor from a wide-enough sample", () => {
    // Idle most of the day, one evening burst: spans 17h, so shape is reliable.
    // kWh [0,0,0,30] -> avg 30 kW; interval peak 120 kW; load factor 0.25 (spiky).
    const sig = meterSignature([r(3, 0), r(9, 0), r(15, 0), r(20, 30)], {
      tariff: "AG-C",
    });
    expect(sig.peakKw).toBe(120);
    expect(sig.avgKw).toBe(30);
    expect(sig.loadFactor).toBe(0.25);
    expect(sig.tariff).toBe("AG-C");
    expect(sig.readings).toBe(4);
  });

  it("withholds the shape signal for a thin, single-window sample", () => {
    // Four consecutive readings across one afternoon hour cannot show idle time, so
    // loadFactor is null even though the peak is still derived.
    const sig = meterSignature([r(20, 22), r(20, 28, 15), r(20, 25, 30), r(20, 24, 45)]);
    expect(sig.peakKw).toBe(112);
    expect(sig.loadFactor).toBeNull();
  });

  it("withholds the shape signal for an all-idle sample (0 is not spiky)", () => {
    const sig = meterSignature([r(3, 0), r(9, 0), r(15, 0), r(20, 0)], {
      cyclePeakKw: [80],
    });
    expect(sig.peakKw).toBe(80); // from the stored cycle peak
    expect(sig.loadFactor).toBeNull(); // absence of usage is not evidence of shape
  });

  it("prefers the stored cycle peak when the interval sample misses it", () => {
    const sig = meterSignature([r(20, 10)], { cyclePeakKw: [138, 112] });
    expect(sig.peakKw).toBe(138); // 138 > the 40 kW the lone reading shows
    expect(sig.loadFactor).toBeNull(); // one reading is too thin for shape
  });

  it("reads peak from cycle peaks alone when there are no intervals", () => {
    const sig = meterSignature([], { tariff: "AG-B", cyclePeakKw: [80] });
    expect(sig).toEqual({
      peakKw: 80,
      avgKw: null,
      loadFactor: null,
      tariff: "AG-B",
      readings: 0,
    });
  });

  it("returns an all-null peak when there is nothing to go on", () => {
    expect(meterSignature([]).peakKw).toBeNull();
  });
});

describe("classifyMeter", () => {
  const sig = (over: Partial<MeterSignature>): MeterSignature => ({
    peakKw: null,
    avgKw: null,
    loadFactor: null,
    tariff: null,
    readings: 0,
    ...over,
  });

  it("classifies a big spiky agricultural meter as a pump, with high confidence", () => {
    const c = classifyMeter(sig({ peakKw: 112, loadFactor: 0.3, tariff: "AG-C" }));
    expect(c.kind).toBe("pump");
    expect(c.confidence).toBeGreaterThan(0.9);
    expect(c.signals.isAgTariff).toBe(true);
  });

  it("classifies a small flat commercial meter as a non-pump", () => {
    const c = classifyMeter(sig({ peakKw: 5, loadFactor: 0.78, tariff: "B-1" }));
    expect(c.kind).toBe("non_pump");
    expect(c.confidence).toBeGreaterThan(0.7);
    expect(c.signals.flat).toBe(true);
  });

  it("treats a big spiky load on a commercial rate as a pump (a booster)", () => {
    // No ag tariff, but a 60 kW spiky load is still clearly a pump.
    const c = classifyMeter(sig({ peakKw: 60, loadFactor: 0.25, tariff: "B-19" }));
    expect(c.kind).toBe("pump");
  });

  it("falls to non_pump at low confidence when the signal is ambiguous", () => {
    const c = classifyMeter(sig({ peakKw: 12, loadFactor: 0.5, tariff: null }));
    expect(c.kind).toBe("non_pump");
    expect(c.confidence).toBe(0.5);
  });

  it("trusts the ag tariff even when only the cycle peak is known", () => {
    const c = classifyMeter(sig({ peakKw: 72, tariff: "AG-B" }));
    expect(c.kind).toBe("pump");
  });
});
