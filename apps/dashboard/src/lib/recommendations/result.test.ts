import { describe, expect, it } from "vitest";
import {
  acceptanceResult,
  firstPostedBillAfter,
  resultViewFor,
  type ResultPeriod,
} from "./result";

const ACCEPTED_AT = "2026-03-15T00:00:00.000Z";

function period(over: Partial<ResultPeriod> = {}): ResultPeriod {
  return { close: "2026-04-10T00:00:00.000Z", printedTotalCents: 282622, ...over };
}

describe("acceptanceResult", () => {
  it("freezes the predicted impact for a numeric rec", () => {
    expect(acceptanceResult({ impactUsd: 11727.33 })).toEqual({
      followed: true,
      predictedUsd: 11727.33,
    });
  });

  it("records followed with no prediction for an info-only rec", () => {
    expect(acceptanceResult({ impactUsd: null })).toEqual({ followed: true });
  });

  it("rounds the prediction to the cent and never carries an actual at acceptance", () => {
    const r = acceptanceResult({ impactUsd: 100.005 });
    expect(r.predictedUsd).toBe(100.01);
    expect(r.actualUsd).toBeUndefined();
  });
});

describe("firstPostedBillAfter", () => {
  it("returns null when no posted bill falls after acceptance", () => {
    // A bill that posted BEFORE acceptance does not count.
    const periods = [period({ close: "2026-02-10T00:00:00.000Z" })];
    expect(firstPostedBillAfter(periods, ACCEPTED_AT)).toBeNull();
  });

  it("excludes a bill whose post date equals acceptance (strictly after)", () => {
    const periods = [period({ close: ACCEPTED_AT })];
    expect(firstPostedBillAfter(periods, ACCEPTED_AT)).toBeNull();
  });

  it("excludes an unreconciled period (no printed total is not a posted bill)", () => {
    const periods = [period({ close: "2026-05-01T00:00:00.000Z", printedTotalCents: null })];
    expect(firstPostedBillAfter(periods, ACCEPTED_AT)).toBeNull();
  });

  it("picks the EARLIEST posted bill after acceptance when several qualify", () => {
    const periods = [
      period({ close: "2026-06-10T00:00:00.000Z", printedTotalCents: 300000 }),
      period({ close: "2026-04-10T00:00:00.000Z", printedTotalCents: 200000 }),
      period({ close: "2026-05-10T00:00:00.000Z", printedTotalCents: 250000 }),
    ];
    expect(firstPostedBillAfter(periods, ACCEPTED_AT)?.printedTotalCents).toBe(200000);
  });

  it("prefers the printed cycle close over the metered end for the post date", () => {
    // Metered end is before acceptance, but the printed cycle close is after it.
    const periods = [
      period({ close: "2026-03-10T00:00:00.000Z", cycleClose: "2026-03-20T00:00:00.000Z" }),
    ];
    expect(firstPostedBillAfter(periods, ACCEPTED_AT)).not.toBeNull();
  });

  it("returns null on an unparseable acceptance instant (fails closed)", () => {
    expect(firstPostedBillAfter([period({ close: "2026-05-01T00:00:00.000Z" })], "not-a-date")).toBeNull();
  });
});

describe("resultViewFor", () => {
  const base = { id: "r1", situation: "Pump 17 looks mis-rated.", resolvedAtIso: ACCEPTED_AT };

  it("reads pending when no bill has posted after acceptance (the v1 by-design state)", () => {
    const v = resultViewFor({
      ...base,
      predictedUsd: 11727.33,
      periods: [period({ close: "2026-02-10T00:00:00.000Z" })],
    });
    expect(v.isPending).toBe(true);
    expect(v.actualUsd).toBeNull();
    expect(v.predictedUsd).toBe(11727.33); // the frozen prediction still shows
  });

  it("realizes the diff from the first post-acceptance bill's printed total (cents -> dollars)", () => {
    const v = resultViewFor({
      ...base,
      predictedUsd: 11727.33,
      periods: [period({ close: "2026-04-10T00:00:00.000Z", printedTotalCents: 282622 })],
    });
    expect(v.isPending).toBe(false);
    expect(v.actualUsd).toBe(2826.22);
    expect(v.predictedUsd).toBe(11727.33);
  });

  it("carries a null prediction for an accepted info-only rec (still pending)", () => {
    const v = resultViewFor({
      ...base,
      predictedUsd: null,
      periods: [period({ close: "2026-02-10T00:00:00.000Z" })],
    });
    expect(v.predictedUsd).toBeNull();
    expect(v.isPending).toBe(true);
  });

  it("is pure: same inputs, same view", () => {
    const input = { ...base, predictedUsd: 500, periods: [period()] };
    expect(resultViewFor(input)).toEqual(resultViewFor(input));
  });
});
