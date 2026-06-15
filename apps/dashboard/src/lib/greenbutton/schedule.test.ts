import { describe, expect, it } from "vitest";
import {
  billingCycleForSerial,
  closeDateForSerial,
  loadMeterReadSchedule,
  readDatesForSerial,
} from "./schedule";

// Asserts the committed fixtures/pge-meter-read-schedule.json against known cycle
// dates. The pure date math is covered separately in src/lib/energy/billing.test.ts.
describe("meter-read schedule", () => {
  it("loads the 2026 table covering the farm's cycle codes", () => {
    const schedule = loadMeterReadSchedule();
    expect(schedule.year).toBe(2026);
    // The fixture also carries the real 2026 serial letters since Story 3.5;
    // this legacy demo path only requires its MR codes to remain present.
    for (const code of ["MR-07", "MR-14", "MR-21"]) {
      expect(schedule.cycles[code], code).toBeDefined();
    }
    for (const dates of Object.values(schedule.cycles)) {
      expect(dates).toHaveLength(12); // one read per month
    }
  });

  it("returns null for an unknown cycle code", () => {
    expect(readDatesForSerial("MR-99")).toBeNull();
    expect(closeDateForSerial("MR-99", "2026-06-13")).toBeNull();
    expect(billingCycleForSerial("MR-99", "2026-06-13")).toBeNull();
  });

  it("derives the cycle close from a billing serial (MR-14)", () => {
    expect(closeDateForSerial("MR-14", "2026-06-13")).toBe("2026-07-15");
    expect(closeDateForSerial("MR-14", "2026-06-12")).toBe("2026-06-12");
  });

  it("derives the full cycle window (MR-07)", () => {
    expect(billingCycleForSerial("MR-07", "2026-06-13")).toEqual({
      start: "2026-06-06", // day after the 2026-06-05 read
      close: "2026-07-08",
    });
  });
});
