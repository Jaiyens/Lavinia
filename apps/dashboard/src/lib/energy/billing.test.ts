import { describe, expect, it } from "vitest";
import { billingCycleFor, closeOnOrAfter, daysToClose } from "./billing";

// A slice of the MR-14 cycle from fixtures/pge-meter-read-schedule.json. The
// schedule loader is tested separately (schedule.test.ts) against the real
// fixture; here we pin the pure date math against a known list.
const MR14 = [
  "2026-05-14",
  "2026-06-12",
  "2026-07-15",
  "2026-08-13",
];

describe("closeOnOrAfter", () => {
  it("returns the next read strictly after a mid-cycle date", () => {
    expect(closeOnOrAfter(MR14, "2026-06-13")).toBe("2026-07-15");
  });

  it("treats a read landing on the ref date as that day's close", () => {
    expect(closeOnOrAfter(MR14, "2026-06-12")).toBe("2026-06-12");
  });

  it("is order-independent (sorts the table)", () => {
    expect(closeOnOrAfter([...MR14].reverse(), "2026-06-13")).toBe("2026-07-15");
  });

  it("returns null past the last scheduled read", () => {
    expect(closeOnOrAfter(MR14, "2026-09-01")).toBeNull();
  });
});

describe("billingCycleFor", () => {
  it("opens the day after the prior read and closes on the next read", () => {
    expect(billingCycleFor(MR14, "2026-06-13")).toEqual({
      start: "2026-06-13", // day after the 2026-06-12 read
      close: "2026-07-15",
    });
  });

  it("places the cycle whose close lands on the ref date", () => {
    expect(billingCycleFor(MR14, "2026-06-12")).toEqual({
      start: "2026-05-15", // day after the 2026-05-14 read
      close: "2026-06-12",
    });
  });

  it("returns null when no prior read anchors the start", () => {
    // 2026-05-14 is the first date in the table: the cycle opened last year.
    expect(billingCycleFor(MR14, "2026-05-01")).toBeNull();
  });

  it("returns null past the last scheduled read", () => {
    expect(billingCycleFor(MR14, "2026-12-01")).toBeNull();
  });
});

describe("daysToClose", () => {
  it("counts whole days remaining until the cycle closes", () => {
    expect(daysToClose("2026-07-15", "2026-07-01")).toBe(14);
  });

  it("is 0 on the close day and negative past it", () => {
    expect(daysToClose("2026-07-15", "2026-07-15")).toBe(0);
    expect(daysToClose("2026-07-15", "2026-07-16")).toBe(-1);
  });

  it("counts correctly across a month boundary", () => {
    expect(daysToClose("2026-07-15", "2026-06-12")).toBe(33);
  });
});
