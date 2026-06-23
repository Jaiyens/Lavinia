import { describe, expect, it } from "vitest";
import { cadenceWindowMs, isDueForRun } from "./route";

// Pure unit test for the cadence-skip logic (no DB, always runs offline). The dispatcher
// uses isDueForRun to decide whether enough time has passed since the last completed run of
// an agent's kind for a farm.

describe("cadence windows", () => {
  it("daily is under 24h of slack, monthly under a calendar month", () => {
    expect(cadenceWindowMs("daily")).toBe(20 * 60 * 60 * 1000);
    expect(cadenceWindowMs("monthly")).toBe(28 * 24 * 60 * 60 * 1000);
    expect(cadenceWindowMs("daily")).toBeLessThan(24 * 60 * 60 * 1000);
    expect(cadenceWindowMs("monthly")).toBeLessThan(31 * 24 * 60 * 60 * 1000);
  });
});

describe("isDueForRun", () => {
  const now = new Date("2026-06-22T13:00:00.000Z");

  it("is due when there is no prior completed run", () => {
    expect(isDueForRun(null, "daily", now)).toBe(true);
    expect(isDueForRun(null, "monthly", now)).toBe(true);
  });

  it("is NOT due when the last daily run completed inside the window", () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isDueForRun(oneHourAgo, "daily", now)).toBe(false);
  });

  it("IS due when the last daily run completed outside the window", () => {
    const longAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isDueForRun(longAgo, "daily", now)).toBe(true);
  });

  it("respects the monthly window", () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(isDueForRun(tenDaysAgo, "monthly", now)).toBe(false);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    expect(isDueForRun(fortyDaysAgo, "monthly", now)).toBe(true);
  });
});
