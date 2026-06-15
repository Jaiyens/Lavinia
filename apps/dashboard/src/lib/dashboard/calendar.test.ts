import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterReadSchedule } from "@/lib/pge/schedule";
import type { MeterView, MeterPeriodView } from "./load";
import { anyResolvableSerial, calendarBounds, calendarMonth, defaultCalendarMonth } from "./calendar";

const SCHEDULE: MeterReadSchedule = {
  year: 2026,
  mayShiftNote: "may shift",
  cycles: {
    // Real-shaped: B's January statement reads in December 2025 (the wrap).
    B: ["2025-12-23", "2026-01-23", "2026-02-24", "2026-03-25", "2026-04-23", "2026-05-22", "2026-06-23", "2026-07-22", "2026-08-21", "2026-09-22", "2026-10-21", "2026-11-19"],
    Q: ["2026-01-09", "2026-02-10", "2026-03-12", "2026-04-10", "2026-05-11", "2026-06-09", "2026-07-09", "2026-08-10", "2026-09-09", "2026-10-08", "2026-11-06", "2026-12-08"],
  },
};

function period(close: string): MeterPeriodView {
  return {
    start: "2026-02-11T00:00:00.000Z",
    close,
    printedTotalCents: 1000,
    demandCents: null,
    peakKw: null,
    tariff: "AGC",
    lineItems: [],
  };
}

function meter(
  id: string,
  over: Partial<MeterView> = {},
): MeterView {
  return {
    id,
    name: id,
    serviceId: id,
    rateSchedule: "AGC",
    isLegacy: false,
    status: null,
    coverageState: "reconciled" as CoverageState,
    accountNumber: null,
    ranchName: null,
    entityName: null,
    cropName: null,
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
    growerPumpId: null,
    serialCode: null,
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

describe("calendarMonth", () => {
  it("buckets actual closes by day; one chip per meter per day", () => {
    const m = calendarMonth(
      [
        meter("P1", { periods: [period("2026-03-12T00:00:00.000Z"), period("2026-03-12T00:00:00.000Z")] }),
        meter("P2", { periods: [period("2026-03-12T00:00:00.000Z"), period("2026-03-26T00:00:00.000Z")] }),
        meter("P3", { periods: [period("2026-02-11T00:00:00.000Z")] }), // other month
      ],
      2026,
      3,
      SCHEDULE,
    );
    const day12 = m.days[11];
    expect(day12?.chips.map((c) => c.meterId)).toEqual(["P1", "P2"]);
    expect(day12?.chips.every((c) => c.kind === "actual")).toBe(true);
    expect(m.days[25]?.chips.map((c) => c.meterId)).toEqual(["P2"]);
    expect(m.actualCount).toBe(3);
    expect(m.scheduledCount).toBe(0);
  });

  it("places scheduled reads by DATE, so the December wrap lands on the December grid", () => {
    const serialB = meter("PB", { serialCode: "B" });
    const dec25 = calendarMonth([serialB], 2025, 12, SCHEDULE);
    expect(dec25.days[22]?.chips).toEqual([
      { meterId: "PB", meterName: "PB", kind: "scheduled" },
    ]);
    // And January 2026 carries B's 1/23 read (the FEB statement's read date).
    const jan26 = calendarMonth([serialB], 2026, 1, SCHEDULE);
    expect(jan26.days[22]?.chips).toHaveLength(1);
  });

  it("a meter without a serial code gets no scheduled chips; unknown serials yield none", () => {
    const m = calendarMonth(
      [meter("P1"), meter("P2", { serialCode: "14A" })], // outage-block-shaped code
      2026,
      3,
      SCHEDULE,
    );
    expect(m.scheduledCount).toBe(0);
  });

  it("actual and scheduled coexist on one day, actual listed first", () => {
    const m = calendarMonth(
      [
        meter("PQ", { serialCode: "q" }), // case-tolerant
        meter("PA", { periods: [period("2026-03-12T00:00:00.000Z")] }),
      ],
      2026,
      3,
      SCHEDULE,
    );
    expect(m.days[11]?.chips).toEqual([
      { meterId: "PA", meterName: "PA", kind: "actual" },
      { meterId: "PQ", meterName: "PQ", kind: "scheduled" },
    ]);
  });

  it("builds the right grid shape", () => {
    const m = calendarMonth([], 2026, 3, SCHEDULE);
    expect(m.days).toHaveLength(31);
    expect(m.leadingBlanks).toBe(0); // 2026-03-01 is a Sunday
    expect(m.days[0]?.iso).toBe("2026-03-01");
    const feb = calendarMonth([], 2026, 2, SCHEDULE);
    expect(feb.days).toHaveLength(28);
    expect(feb.leadingBlanks).toBe(0); // 2026-02-01 is a Sunday
    const jan = calendarMonth([], 2026, 1, SCHEDULE);
    expect(jan.leadingBlanks).toBe(4); // 2026-01-01 is a Thursday
  });

  it("is pure: does not mutate the meters", () => {
    const meters = [meter("P1", { periods: [period("2026-03-12T00:00:00.000Z")] })];
    const snapshot = JSON.parse(JSON.stringify(meters)) as unknown;
    calendarMonth(meters, 2026, 3, SCHEDULE);
    expect(meters).toEqual(snapshot);
  });
});

describe("defaultCalendarMonth", () => {
  it("opens on the month of the latest posted close", () => {
    const meters = [
      meter("P1", { periods: [period("2026-01-12T00:00:00.000Z"), period("2026-03-12T00:00:00.000Z")] }),
      meter("P2", { periods: [period("2026-02-11T00:00:00.000Z")] }),
    ];
    expect(defaultCalendarMonth(meters, "2026-06-09")).toEqual({ year: 2026, month: 3 });
  });

  it("falls back to today's month when no bills exist", () => {
    expect(defaultCalendarMonth([], "2026-06-09")).toEqual({ year: 2026, month: 6 });
  });
});

describe("calendarBounds", () => {
  it("spans the earliest close to today's month when no serials exist", () => {
    const meters = [meter("P1", { periods: [period("2025-12-11T00:00:00.000Z")] })];
    expect(calendarBounds(meters, SCHEDULE, "2026-06-09")).toEqual({
      minYm: "2025-12",
      maxYm: "2026-06",
    });
  });

  it("extends to the serial's OWN first and last dates, so the December wrap is reachable", () => {
    // Serial B's first read is 2025-12-23: the bounds must include 2025-12,
    // and must stop at B's last read month (2026-11), not a synthetic 2026-12.
    const wrap = [meter("PB", { serialCode: "B" })];
    expect(calendarBounds(wrap, SCHEDULE, "2026-06-09")).toEqual({
      minYm: "2025-12",
      maxYm: "2026-11",
    });
    const q = [meter("P1", { serialCode: "Q", periods: [period("2026-02-11T00:00:00.000Z")] })];
    expect(calendarBounds(q, SCHEDULE, "2026-06-09")).toEqual({
      minYm: "2026-01",
      maxYm: "2026-12",
    });
  });

  it("an unresolvable code (outage block '14A') never widens the bounds", () => {
    const meters = [meter("P1", { serialCode: "14A", periods: [period("2026-02-11T00:00:00.000Z")] })];
    expect(calendarBounds(meters, SCHEDULE, "2026-06-09")).toEqual({
      minYm: "2026-02",
      maxYm: "2026-06",
    });
  });
});

describe("anyResolvableSerial", () => {
  it("true only when a serial actually resolves in the table", () => {
    expect(anyResolvableSerial([meter("P1")], SCHEDULE)).toBe(false);
    expect(anyResolvableSerial([meter("P1", { serialCode: "14A" })], SCHEDULE)).toBe(false);
    expect(anyResolvableSerial([meter("P1", { serialCode: " q " })], SCHEDULE)).toBe(true);
  });
});
