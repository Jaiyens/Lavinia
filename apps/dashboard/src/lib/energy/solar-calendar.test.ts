import { describe, expect, it } from "vitest";
import {
  buildTrueUpCalendar,
  type TrueUpEntryInput,
} from "./solar-calendar";

// D-1 (FR12/FR13): the true-up calendar derivation, proven in isolation. The "now" is always the
// injected `todayMonth` (never a clock). These tests pin the rolling-forward grid placement, the
// per-cell meter/array settling counts, the next-upcoming pull-out (earliest populated month with its
// meter count + monthsAhead), the no-month exclusion, and the December-cluster fixture. No dollar is
// ever produced (honest-blank, FR14).

function meter(id: string, trueUpMonth: number): TrueUpEntryInput {
  return { id, kind: "meter", trueUpMonth };
}

function array(id: string, trueUpMonth: number): TrueUpEntryInput {
  return { id, kind: "array", trueUpMonth };
}

describe("buildTrueUpCalendar", () => {
  it("rolls twelve cells forward from todayMonth inclusive (cells[0] is today)", () => {
    const cal = buildTrueUpCalendar([], 5); // May
    expect(cal.cells).toHaveLength(12);
    expect(cal.cells.map((c) => c.month)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4]);
  });

  it("wraps the rolling window across the year boundary", () => {
    const cal = buildTrueUpCalendar([], 11); // November
    expect(cal.cells.map((c) => c.month)).toEqual([11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("places each entry on its month cell with separate meter and array counts", () => {
    const cal = buildTrueUpCalendar(
      [meter("m1", 7), meter("m2", 7), array("a1", 7), meter("m3", 9)],
      5, // May
    );
    // July is two months ahead of May -> cells[2].
    const july = cal.cells.find((c) => c.month === 7);
    expect(july).toEqual({ month: 7, meterCount: 2, arrayCount: 1 });
    const sept = cal.cells.find((c) => c.month === 9);
    expect(sept).toEqual({ month: 9, meterCount: 1, arrayCount: 0 });
    // An untouched month stays at zero, never a fabricated count.
    const june = cal.cells.find((c) => c.month === 6);
    expect(june).toEqual({ month: 6, meterCount: 0, arrayCount: 0 });
  });

  it("names the next-upcoming as the earliest populated month with its meter count and monthsAhead", () => {
    const cal = buildTrueUpCalendar(
      [meter("m1", 9), meter("m2", 7), meter("m3", 7)],
      5, // May
    );
    // July (two months ahead) is the earliest populated month, with two meters.
    expect(cal.nextUpcoming).toEqual({ month: 7, meterCount: 2, monthsAhead: 2 });
  });

  it("counts a meter settling exactly this month as 0 months ahead", () => {
    const cal = buildTrueUpCalendar([meter("m1", 5)], 5); // May, settling in May
    expect(cal.nextUpcoming).toEqual({ month: 5, meterCount: 1, monthsAhead: 0 });
    expect(cal.cells[0]).toEqual({ month: 5, meterCount: 1, arrayCount: 0 });
  });

  it("does not let an array-only month define the next-upcoming (the lead counts meters)", () => {
    const cal = buildTrueUpCalendar(
      [array("a1", 6), meter("m1", 8)],
      5, // May
    );
    // June settles an array but no meter; the next-upcoming pull-out is August (the meter).
    expect(cal.nextUpcoming).toEqual({ month: 8, meterCount: 1, monthsAhead: 3 });
    // June still carries its array count on the grid.
    expect(cal.cells.find((c) => c.month === 6)).toEqual({ month: 6, meterCount: 0, arrayCount: 1 });
  });

  it("returns nextUpcoming null when no meter has a true-up month (honest absence, never a date)", () => {
    const cal = buildTrueUpCalendar([], 5);
    expect(cal.nextUpcoming).toBeNull();
    expect(cal.cells.every((c) => c.meterCount === 0 && c.arrayCount === 0)).toBe(true);
  });

  it("ignores an out-of-range entry month (not placed, never a guess)", () => {
    const cal = buildTrueUpCalendar(
      [meter("bad-lo", 0), meter("bad-hi", 13), meter("frac", 7.5), meter("ok", 7)],
      5,
    );
    const july = cal.cells.find((c) => c.month === 7);
    expect(july).toEqual({ month: 7, meterCount: 1, arrayCount: 0 }); // only the in-range "ok"
    expect(cal.nextUpcoming).toEqual({ month: 7, meterCount: 1, monthsAhead: 2 });
  });

  it("fails closed on an out-of-range todayMonth: twelve empty cells, no next-upcoming", () => {
    const lo = buildTrueUpCalendar([meter("m1", 7)], 0);
    expect(lo.nextUpcoming).toBeNull();
    expect(lo.cells.every((c) => c.meterCount === 0 && c.arrayCount === 0)).toBe(true);
    const hi = buildTrueUpCalendar([meter("m1", 7)], 13);
    expect(hi.nextUpcoming).toBeNull();
  });

  it("December cluster six weeks out surfaces as next-upcoming with its correct meter count", () => {
    // Today is mid-October (todayMonth 10); a December true-up is about six weeks out (two months).
    // Fourteen Batth-shaped solar meters carry true-up months; six cluster in December.
    const entries: TrueUpEntryInput[] = [
      meter("d1", 12),
      meter("d2", 12),
      meter("d3", 12),
      meter("d4", 12),
      meter("d5", 12),
      meter("d6", 12),
      meter("a1", 4),
      meter("a2", 4),
      meter("a3", 6),
      meter("a4", 6),
      meter("a5", 8),
      meter("a6", 9),
      meter("a7", 3),
      meter("a8", 11),
      array("arr-840", 12),
      array("arr-1092", 6),
    ];
    const cal = buildTrueUpCalendar(entries, 10); // October
    // November (one ahead) settles one meter; December (two ahead) settles six meters + an array.
    expect(cal.nextUpcoming).toEqual({ month: 11, meterCount: 1, monthsAhead: 1 });
    const december = cal.cells.find((c) => c.month === 12);
    expect(december).toEqual({ month: 12, meterCount: 6, arrayCount: 1 });
    // Every entry lands in its correct month cell.
    expect(cal.cells.find((c) => c.month === 4)).toEqual({ month: 4, meterCount: 2, arrayCount: 0 });
    expect(cal.cells.find((c) => c.month === 6)).toEqual({ month: 6, meterCount: 2, arrayCount: 1 });
    expect(cal.cells.find((c) => c.month === 8)).toEqual({ month: 8, meterCount: 1, arrayCount: 0 });
    expect(cal.cells.find((c) => c.month === 9)).toEqual({ month: 9, meterCount: 1, arrayCount: 0 });
    expect(cal.cells.find((c) => c.month === 3)).toEqual({ month: 3, meterCount: 1, arrayCount: 0 });
    // The 14 meters (6 December + 8 others) are all placed; total meter count across cells is 14.
    const totalMeters = cal.cells.reduce((acc, c) => acc + c.meterCount, 0);
    expect(totalMeters).toBe(14);
  });
});
