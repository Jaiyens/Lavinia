import { describe, expect, it } from "vitest";
import {
  clipToPeakWindow,
  isInPeakWindow,
  localDate,
  localHour,
  peakWindowUtc,
  PEAK_END_HOUR,
  PEAK_START_HOUR,
} from "./peak";

// All instants are UTC. California is the farm's local zone. In June it is PDT
// (UTC-7): 4pm local = 23:00Z, 9pm local = 04:00Z the next day. In January it is
// PST (UTC-8): 4pm local = 00:00Z the next day.
const TZ = "America/Los_Angeles";

describe("local time in the farm's zone", () => {
  it("reads the local hour across the UTC day boundary", () => {
    expect(localHour("2026-06-14T23:00:00.000Z", TZ)).toBe(16); // 4pm PDT
    expect(localHour("2026-06-15T03:45:00.000Z", TZ)).toBe(20); // 8:45pm PDT
    expect(localHour("2026-06-15T04:00:00.000Z", TZ)).toBe(21); // 9pm PDT
    expect(localHour("2026-06-14T22:59:00.000Z", TZ)).toBe(15); // 3:59pm PDT
  });

  it("keeps a late-evening instant on its own local day", () => {
    // 8:45pm PDT on the 14th is past midnight UTC on the 15th.
    expect(localDate("2026-06-15T03:45:00.000Z", TZ)).toBe("2026-06-14");
  });
});

describe("isInPeakWindow", () => {
  it("brackets the 4-9pm window half-open [16, 21)", () => {
    expect(PEAK_START_HOUR).toBe(16);
    expect(PEAK_END_HOUR).toBe(21);
    expect(isInPeakWindow("2026-06-14T23:00:00.000Z", TZ)).toBe(true); // 4:00pm
    expect(isInPeakWindow("2026-06-15T03:45:00.000Z", TZ)).toBe(true); // 8:45pm
    expect(isInPeakWindow("2026-06-15T04:00:00.000Z", TZ)).toBe(false); // 9:00pm exactly
    expect(isInPeakWindow("2026-06-14T22:59:00.000Z", TZ)).toBe(false); // 3:59pm
  });
});

describe("peakWindowUtc", () => {
  it("resolves the summer (PDT) window to UTC instants", () => {
    expect(peakWindowUtc("2026-06-14T23:30:00.000Z", TZ)).toEqual({
      start: "2026-06-14T23:00:00.000Z",
      end: "2026-06-15T04:00:00.000Z",
    });
  });

  it("resolves the winter (PST) window an hour later in UTC", () => {
    expect(peakWindowUtc("2026-01-15T01:00:00.000Z", TZ)).toEqual({
      start: "2026-01-15T00:00:00.000Z",
      end: "2026-01-15T05:00:00.000Z",
    });
  });
});

describe("clipToPeakWindow", () => {
  it("returns a fully-inside run unchanged", () => {
    expect(
      clipToPeakWindow(
        { start: "2026-06-14T23:30:00.000Z", end: "2026-06-15T01:00:00.000Z" },
        TZ,
      ),
    ).toEqual({
      start: "2026-06-14T23:30:00.000Z",
      end: "2026-06-15T01:00:00.000Z",
    });
  });

  it("clips a run that starts before the window opens", () => {
    expect(
      clipToPeakWindow(
        { start: "2026-06-14T22:00:00.000Z", end: "2026-06-14T23:30:00.000Z" },
        TZ,
      ),
    ).toEqual({
      start: "2026-06-14T23:00:00.000Z",
      end: "2026-06-14T23:30:00.000Z",
    });
  });

  it("clips a run that ends after the window closes", () => {
    expect(
      clipToPeakWindow(
        { start: "2026-06-15T03:00:00.000Z", end: "2026-06-15T05:00:00.000Z" },
        TZ,
      ),
    ).toEqual({
      start: "2026-06-15T03:00:00.000Z",
      end: "2026-06-15T04:00:00.000Z",
    });
  });

  it("clips a run that spans the whole window down to the window", () => {
    expect(
      clipToPeakWindow(
        { start: "2026-06-14T21:00:00.000Z", end: "2026-06-15T06:00:00.000Z" },
        TZ,
      ),
    ).toEqual({
      start: "2026-06-14T23:00:00.000Z",
      end: "2026-06-15T04:00:00.000Z",
    });
  });

  it("returns null for a run that never touches the window", () => {
    expect(
      clipToPeakWindow(
        { start: "2026-06-14T22:00:00.000Z", end: "2026-06-14T22:45:00.000Z" },
        TZ,
      ),
    ).toBeNull();
  });
});
