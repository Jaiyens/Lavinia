import { describe, expect, it } from "vitest";
import type { IntervalReading } from "./types";
import {
  bucketByDayOfWeek,
  bucketByHourOfDay,
  bucketByMonth,
  bucketByTouPeriod,
  summarizeIntervalWindow,
  type UsageBucket,
} from "./interval-stats";

// A 15-minute reading helper. kWh is the energy in the interval; kW is kWh * 4.
function r(start: string, kWh: number, extra?: Partial<IntervalReading>): IntervalReading {
  return { start, durationSec: 900, kWh, ...extra };
}

// Find a bucket by key, narrowing past `noUncheckedIndexedAccess` with a clear
// failure rather than an index that the type system reads as possibly-undefined.
function pick(buckets: readonly UsageBucket[], key: string): UsageBucket {
  const bucket = buckets.find((b) => b.key === key);
  if (!bucket) throw new Error(`no bucket for key "${key}"`);
  return bucket;
}

// Bucket by farm-local time in UTC for clean arithmetic; one case below proves
// the America/Los_Angeles offset is actually applied.
const UTC = { timeZone: "UTC" } as const;

describe("summarizeIntervalWindow", () => {
  it("totals energy, finds the peak and its time, and the spanned window", () => {
    const s = summarizeIntervalWindow([
      r("2026-06-01T05:00:00.000Z", 10), // 40 kW
      r("2026-06-01T05:15:00.000Z", 28), // 112 kW (the peak)
    ]);
    expect(s.count).toBe(2);
    expect(s.totalKwh).toBe(38);
    expect(s.peak).toEqual({ kw: 112, at: "2026-06-01T05:15:00.000Z" });
    expect(s.windowStart).toBe("2026-06-01T05:00:00.000Z");
    expect(s.windowEnd).toBe("2026-06-01T05:15:00.000Z");
    // 38 kWh over 0.5h (two 15-min intervals) = 76 kW average.
    expect(s.avgKw).toBe(76);
  });

  it("returns empty totals (not NaN) for an empty series", () => {
    const s = summarizeIntervalWindow([]);
    expect(s).toEqual({
      count: 0,
      totalKwh: 0,
      peak: null,
      windowStart: null,
      windowEnd: null,
      avgKw: 0,
    });
  });

  it("counts only import energy by default, all energy when asked", () => {
    const readings = [
      r("2026-06-01T05:00:00.000Z", 10, { direction: "import" }),
      r("2026-06-01T05:15:00.000Z", 100, { direction: "export" }),
    ];
    expect(summarizeIntervalWindow(readings).totalKwh).toBe(10);
    expect(summarizeIntervalWindow(readings).count).toBe(1);
    expect(summarizeIntervalWindow(readings, { includeExport: true }).totalKwh).toBe(110);
    expect(summarizeIntervalWindow(readings, { includeExport: true }).count).toBe(2);
  });
});

describe("bucketByHourOfDay", () => {
  it("groups by local hour, sums kWh, shares, and finds each hour's peak", () => {
    const buckets = bucketByHourOfDay(
      [
        r("2026-06-01T05:00:00.000Z", 10), // 40 kW, hour 05
        r("2026-06-01T05:15:00.000Z", 20), // 80 kW, hour 05
        r("2026-06-01T17:00:00.000Z", 5), // 20 kW, hour 17
      ],
      UTC,
    );
    expect(buckets.map((b) => b.key)).toEqual(["05", "17"]);
    const five = pick(buckets, "05");
    expect(five.kWh).toBe(30);
    expect(five.count).toBe(2);
    expect(five.peak).toEqual({ kw: 80, at: "2026-06-01T05:15:00.000Z" });
    expect(five.share).toBeCloseTo(30 / 35, 10);
    expect(pick(buckets, "17").share).toBeCloseTo(5 / 35, 10);
  });

  it("applies the America/Los_Angeles offset (a 00:30Z reading is 17:30 PDT)", () => {
    const buckets = bucketByHourOfDay([r("2026-06-01T00:30:00.000Z", 4)], {
      timeZone: "America/Los_Angeles",
    });
    expect(buckets.map((b) => b.key)).toEqual(["17"]);
  });
});

describe("bucketByDayOfWeek", () => {
  it("folds same-weekday readings together, Monday-first (2026-06-01 is a Monday)", () => {
    const buckets = bucketByDayOfWeek(
      [
        r("2026-06-01T12:00:00.000Z", 10), // Mon
        r("2026-06-08T12:00:00.000Z", 14), // Mon (7 days later)
        r("2026-06-02T12:00:00.000Z", 5), // Tue
      ],
      UTC,
    );
    expect(buckets.map((b) => b.key)).toEqual(["Mon", "Tue"]);
    expect(pick(buckets, "Mon").kWh).toBe(24);
    expect(pick(buckets, "Mon").count).toBe(2);
    expect(pick(buckets, "Tue").kWh).toBe(5);
  });
});

describe("bucketByMonth", () => {
  it("groups by calendar month in chronological order", () => {
    const buckets = bucketByMonth(
      [r("2026-05-31T12:00:00.000Z", 3), r("2026-06-01T12:00:00.000Z", 7)],
      UTC,
    );
    expect(buckets.map((b) => b.key)).toEqual(["2026-05", "2026-06"]);
    expect(buckets.map((b) => b.kWh)).toEqual([3, 7]);
  });
});

describe("bucketByTouPeriod", () => {
  it("returns all three periods in fixed order and folds unlabeled energy into off_peak", () => {
    const buckets = bucketByTouPeriod([
      r("2026-06-01T18:00:00.000Z", 10, { touCode: "WPK" }), // peak
      r("2026-06-01T15:00:00.000Z", 20, { touCode: "PP" }), // partial_peak
      r("2026-06-01T02:00:00.000Z", 30, { touCode: "WOP" }), // off_peak
      r("2026-06-01T03:00:00.000Z", 5), // no touCode -> off_peak
    ]);
    expect(buckets.map((b) => b.key)).toEqual(["peak", "partial_peak", "off_peak"]);
    expect(pick(buckets, "peak").kWh).toBe(10);
    expect(pick(buckets, "partial_peak").kWh).toBe(20);
    expect(pick(buckets, "off_peak").kWh).toBe(35); // 30 labeled + 5 unlabeled
    expect(pick(buckets, "off_peak").count).toBe(2);
    expect(pick(buckets, "peak").share).toBeCloseTo(10 / 65, 10);
    expect(pick(buckets, "off_peak").share).toBeCloseTo(35 / 65, 10);
  });

  it("excludes export energy from the on-peak share by default", () => {
    const buckets = bucketByTouPeriod([
      r("2026-06-01T18:00:00.000Z", 10, { touCode: "WPK" }),
      r("2026-06-01T18:15:00.000Z", 100, { touCode: "WPK", direction: "export" }),
    ]);
    expect(pick(buckets, "peak").kWh).toBe(10); // export not counted
    expect(pick(buckets, "peak").share).toBe(1);
  });
});
