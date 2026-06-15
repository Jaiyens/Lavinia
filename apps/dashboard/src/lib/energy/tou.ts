// The two PG&E time-of-use clocks, defined once and NEVER conflated (AR-14).
// Pure data + a window test; no UI, no DB, no fixture.
//
// 1. The AG RATE peak window drives pricing math: TOU energy peak rates and the
//    AG-C/AG-5 peak-period demand charge. Per PG&E's published ag tariff
//    (pge.com/tariffs ELEC_SCHEDS_AG.pdf, verified 2026-06-09) it is 5-8pm,
//    year-round, every day including holidays.
// 2. The PDP/DR EVENT window is when demand-response events are called and is
//    what DR copy (FR-18 / story 3.7) talks about: 4-9pm. It prices nothing.
//
// Anything bucketing usage for RATE math reads RATE_PEAK_WINDOW; anything about
// demand-response programs reads DR_EVENT_WINDOW. A module needing "the peak
// window" must pick one deliberately - there is no generic peak.

/** A daily clock window in local (meter) hours: [startHour, endHour).
 *  Same-day windows only (startHour < endHour required); a midnight-crossing
 *  window cannot be represented here and would silently match nothing in
 *  isInWindow - model it as two windows if one ever exists. */
export type ClockWindow = {
  /** First hour inside the window, 0-23. */
  startHour: number;
  /** First hour AFTER the window, 1-24. Must exceed startHour. */
  endHour: number;
};

/** PG&E AG rate peak: 5-8pm year-round daily. Prices energy + peak-period demand. */
export const RATE_PEAK_WINDOW: ClockWindow = { startHour: 17, endHour: 20 };

/** PDP/DR event window: 4-9pm. Demand-response copy only; never prices a rate. */
export const DR_EVENT_WINDOW: ClockWindow = { startHour: 16, endHour: 21 };

/** Whether a local hour (0-23) falls inside a window. */
export function isInWindow(hour: number, window: ClockWindow): boolean {
  return hour >= window.startHour && hour < window.endHour;
}
