import { describe, expect, it } from "vitest";
import { DR_EVENT_WINDOW, RATE_PEAK_WINDOW, isInWindow } from "./tou";

describe("the two TOU clocks", () => {
  it("keeps the rate peak (5-8pm) and the DR event window (4-9pm) distinct", () => {
    expect(RATE_PEAK_WINDOW).toEqual({ startHour: 17, endHour: 20 });
    expect(DR_EVENT_WINDOW).toEqual({ startHour: 16, endHour: 21 });
    expect(RATE_PEAK_WINDOW).not.toEqual(DR_EVENT_WINDOW);
  });

  it("places the boundary hours correctly in each window", () => {
    // 4pm: a DR-event hour but NOT a rate-peak hour - the hour that conflation gets wrong.
    expect(isInWindow(16, DR_EVENT_WINDOW)).toBe(true);
    expect(isInWindow(16, RATE_PEAK_WINDOW)).toBe(false);
    // 5pm opens the rate peak; 8pm closes it (end-exclusive) but is still a DR hour.
    expect(isInWindow(17, RATE_PEAK_WINDOW)).toBe(true);
    expect(isInWindow(20, RATE_PEAK_WINDOW)).toBe(false);
    expect(isInWindow(20, DR_EVENT_WINDOW)).toBe(true);
    // 9pm closes the DR window.
    expect(isInWindow(21, DR_EVENT_WINDOW)).toBe(false);
  });
});
