import { describe, expect, it } from "vitest";
import { intervalSpan } from "./import";

// Regression guard for the high-history (Batth-scale) import path. The importer used to span a
// meter's window with `new Date(Math.min(...starts.map(d => d.getTime())))`, which spreads the
// entire interval array as call arguments and throws "Maximum call stack size exceeded" once
// the array is large enough. A real PG&E meter can hold multiple years of 15-minute readings
// (1 year = 35,040 points; multi-year = 100k+), so this is not hypothetical at 183 meters.
describe("intervalSpan", () => {
  it("spans a multi-year 15-minute series (200k points) without a stack overflow", () => {
    const base = Date.UTC(2021, 0, 1);
    const step = 900_000; // 15 minutes in ms
    const n = 200_000;
    // Build out of order so the result depends on a real min/max scan, not array position.
    const intervals = Array.from({ length: n }, (_, i) => ({
      start: new Date(base + ((i * 7919) % n) * step).toISOString(),
    }));
    const { min, max } = intervalSpan(intervals);
    expect(min.getTime()).toBe(base);
    expect(max.getTime()).toBe(base + (n - 1) * step);
  });

  it("handles a single interval", () => {
    const { min, max } = intervalSpan([{ start: "2024-03-01T00:00:00.000Z" }]);
    expect(min.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(max.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });
});
