import { describe, expect, it } from "vitest";
import type { CoverageState } from "@/lib/recommendations/types";
import { priceCycleCents, type RateCard, type RatePlan } from "@/lib/energy/rates";
import type { MeterView, MeterPeriodView, MeterLineItemView } from "./load";
import { resolveDrawerProgram, toDrawerDetail, verificationFor } from "./drawer";

function li(over: Partial<MeterLineItemView> & { kind: MeterLineItemView["kind"] }): MeterLineItemView {
  return { label: null, amountCents: 0, quantity: null, unit: null, rate: null, ...over };
}

function period(over: Partial<MeterPeriodView>): MeterPeriodView {
  return {
    start: "2026-02-11T00:00:00.000Z",
    close: "2026-03-12T00:00:00.000Z",
    printedTotalCents: 282622,
    demandCents: null,
    totalKwh: null,
    peakKw: null,
    tariff: "AGC",
    lineItems: [],
    ...over,
  };
}

function meter(over: Partial<MeterView> & { id: string; coverageState: CoverageState }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    accountNumber: "A1",
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
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

describe("toDrawerDetail", () => {
  it("withholds ALL billing figures for a needs_review meter (the AR-15 gate)", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "needs_review",
        periods: [period({ printedTotalCents: 12345, demandCents: 500 })],
      }),
    );
    expect(d.isCovered).toBe(false);
    expect(d.latest).toBeNull();
    expect(d.history).toEqual([]);
  });

  it("withholds billing for a no_bill meter", () => {
    const d = toDrawerDetail(meter({ id: "m1", coverageState: "no_bill" }));
    expect(d.isCovered).toBe(false);
    expect(d.latest).toBeNull();
  });

  it("projects the latest period's TOU rows from tou_energy line items only", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "reconciled",
        periods: [
          period({
            lineItems: [
              li({ kind: "tou_energy", label: "Peak", quantity: 120.5, unit: "kWh", amountCents: 4500 }),
              li({ kind: "tou_energy", label: "Off-Peak", quantity: 900.25, unit: "kWh", amountCents: 9100 }),
              li({ kind: "demand", label: "Max Demand", amountCents: 278322 }),
              li({ kind: "other", label: "Customer Charge", amountCents: 4300 }),
            ],
          }),
        ],
      }),
    );
    expect(d.latest?.touRows).toEqual([
      { label: "Peak", kwh: 120.5, amountCents: 4500 },
      { label: "Off-Peak", kwh: 900.25, amountCents: 9100 },
    ]);
    expect(d.latest?.otherRows).toEqual([{ label: "Customer Charge", amountCents: 4300 }]);
  });

  it("drops the quantity from a TOU row whose unit is not kWh (never a fabricated unit)", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "reconciled",
        periods: [
          period({
            lineItems: [
              li({ kind: "tou_energy", label: "Peak", quantity: 12, unit: "kW", amountCents: 100 }),
              li({ kind: "tou_energy", label: "Off-Peak", quantity: 34, unit: null, amountCents: 200 }),
            ],
          }),
        ],
      }),
    );
    expect(d.latest?.touRows).toEqual([
      { label: "Peak", kwh: null, amountCents: 100 },
      { label: "Off-Peak", kwh: null, amountCents: 200 },
    ]);
  });

  it("keeps demand absent (null) distinct from a zero demand charge", () => {
    const none = toDrawerDetail(
      meter({ id: "m1", coverageState: "reconciled", periods: [period({ demandCents: null })] }),
    );
    const zero = toDrawerDetail(
      meter({ id: "m2", coverageState: "reconciled", periods: [period({ demandCents: 0 })] }),
    );
    expect(none.latest?.demandCents).toBeNull();
    expect(zero.latest?.demandCents).toBe(0);
  });

  it("preserves a negative NEM-credit total, never clamped", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "reconciled",
        periods: [period({ printedTotalCents: -14911 })],
      }),
    );
    expect(d.latest?.totalCents).toBe(-14911);
  });

  it("falls back to the inventory rate schedule when the period has no tariff", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "reconciled",
        rateSchedule: "AG5B",
        periods: [period({ tariff: null })],
      }),
    );
    expect(d.latest?.tariff).toBe("AG5B");
  });

  it("lists prior periods newest first and skips null totals; single period yields no history", () => {
    const multi = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "reconciled",
        periods: [
          period({ close: "2026-01-12T00:00:00.000Z", printedTotalCents: 100 }),
          period({ close: "2026-02-12T00:00:00.000Z", printedTotalCents: null }),
          period({ close: "2026-03-12T00:00:00.000Z", printedTotalCents: 300 }),
          period({ close: "2026-04-12T00:00:00.000Z", printedTotalCents: 400 }),
        ],
      }),
    );
    expect(multi.history).toEqual([
      { close: "2026-03-12T00:00:00.000Z", totalCents: 300 },
      { close: "2026-01-12T00:00:00.000Z", totalCents: 100 },
    ]);
    expect(multi.latest?.totalCents).toBe(400);

    const single = toDrawerDetail(
      meter({ id: "m2", coverageState: "reconciled", periods: [period({})] }),
    );
    expect(single.history).toEqual([]);
  });

  it("returns latest = null for a reconciled meter with no periods (renders honest absence)", () => {
    const d = toDrawerDetail(meter({ id: "m1", coverageState: "reconciled" }));
    expect(d.isCovered).toBe(true);
    expect(d.latest).toBeNull();
  });

  it("shows the solar section for isSolar OR a NEM program, hidden otherwise", () => {
    expect(toDrawerDetail(meter({ id: "a", coverageState: "no_bill", isSolar: true })).showSolar).toBe(true);
    expect(toDrawerDetail(meter({ id: "b", coverageState: "no_bill", nemType: "nem2" })).showSolar).toBe(true);
    expect(toDrawerDetail(meter({ id: "c", coverageState: "no_bill" })).showSolar).toBe(false);
  });

  it("projects solar fields and array linkage; empty relation stays an honest empty list", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "no_bill",
        isSolar: true,
        nemType: "nem2",
        trueUpMonth: 9,
        solarKw: 1092,
        benefitingArrays: [
          {
            id: "arr1",
            name: "South Array",
            nameplateKw: 1092,
            nemType: "nem2",
            trueUpMonth: 9,
            interconnectionDate: null,
          },
        ],
      }),
    );
    expect(d.solar).toEqual({
      nemType: "nem2",
      program: { kind: "generic", raw: "nem2" },
      trueUpMonth: 9,
      solarKw: 1092,
      allocationShare: null,
      // F-1/F-3: honest-unknown - no asOf supplied and no PTO date on file (the launch state).
      grandfather: { state: "unknown" },
      arrays: [{ id: "arr1", name: "South Array", nameplateKw: 1092 }],
      position: null,
      nemChargesCents: null,
      trueUpAmountCents: null,
      demandOwedCents: null,
      uncoveredShare: null, // no demand quotable -> honest-blank
      floor: null, // no demand quotable -> no floor group
    });

    const empty = toDrawerDetail(meter({ id: "m2", coverageState: "no_bill", isSolar: true }));
    expect(empty.solar.arrays).toEqual([]);
  });

  it("computes the real allocation share when the fleet is supplied and the meter is under one array (C-2)", () => {
    const arr = { id: "arr1", name: "West", nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: null };
    const m1 = meter({
      id: "m1",
      coverageState: "reconciled",
      isSolar: true,
      benefitingArrays: [arr],
      periods: [period({ totalKwh: 30 })],
    });
    const m2 = meter({
      id: "m2",
      coverageState: "reconciled",
      isSolar: true,
      benefitingArrays: [arr],
      periods: [period({ totalKwh: 10 })],
    });
    // With the fleet, m1's share of West is 30 / (30 + 10) = 0.75.
    const d = toDrawerDetail(m1, [m1, m2]);
    expect(d.solar.allocationShare).toBe(0.75);
    // Without the fleet (the Energy drawer) the share stays honest-blank.
    expect(toDrawerDetail(m1).solar.allocationShare).toBeNull();
  });

  it("stays honest-blank when the meter is under more than one array (never guesses which split)", () => {
    const west = { id: "w", name: "West", nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: null };
    const east = { id: "e", name: "East", nameplateKw: 1092, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: null };
    const m1 = meter({
      id: "m1",
      coverageState: "reconciled",
      isSolar: true,
      benefitingArrays: [west, east],
      periods: [period({ totalKwh: 30 })],
    });
    expect(toDrawerDetail(m1, [m1]).solar.allocationShare).toBeNull();
  });

  it("a meter with no billed usage stays not-on-file (share null), never a fabricated zero (C-2/FR10)", () => {
    const arr = { id: "arr1", name: "West", nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: null };
    const m1 = meter({ id: "m1", coverageState: "no_bill", isSolar: true, benefitingArrays: [arr], periods: [] });
    expect(toDrawerDetail(m1, [m1]).solar.allocationShare).toBeNull();
  });

  it("is pure: does not mutate the input meter", () => {
    const m = meter({
      id: "m1",
      coverageState: "reconciled",
      periods: [
        period({ close: "2026-01-12T00:00:00.000Z", printedTotalCents: 100 }),
        period({ close: "2026-02-12T00:00:00.000Z", printedTotalCents: 200 }),
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(m));
    toDrawerDetail(m);
    expect(m).toEqual(snapshot);
  });
});

describe("toDrawerDetail solar NEM facts (Story 3.4)", () => {
  const nemMonths = [
    { start: "2025-05-10T00:00:00.000Z", close: "2025-06-09T00:00:00.000Z", netKwh: 12000, amountCents: 327235 },
    { start: "2025-06-10T00:00:00.000Z", close: "2025-07-10T00:00:00.000Z", netKwh: -11804, amountCents: -234268 },
  ];

  it("derives position and NEM charges from the persisted months", () => {
    const d = toDrawerDetail(
      meter({ id: "m1", coverageState: "reconciled", isSolar: true, nemPeriods: nemMonths }),
    );
    expect(d.solar.position).toBe("net_consumer"); // +196 net over a 12000-kWh-scale series
    expect(d.solar.nemChargesCents).toBe(327235 - 234268);
  });

  it("leaves position/charges null when no months are on file (honest absence)", () => {
    const d = toDrawerDetail(meter({ id: "m2", coverageState: "reconciled", isSolar: true }));
    expect(d.solar.position).toBeNull();
    expect(d.solar.nemChargesCents).toBeNull();
  });

  it("quotes the demand line only for a reconciled solar meter with billed demand", () => {
    const withDemand = meter({
      id: "m3",
      coverageState: "reconciled",
      isSolar: true,
      periods: [period({ demandCents: 250 }), period({ start: "2026-01-01T00:00:00.000Z", demandCents: 119 })],
    });
    expect(toDrawerDetail(withDemand).solar.demandOwedCents).toBe(369);

    // Unreconciled: the dollar is withheld even though line items exist (AR-15).
    const unreconciled = meter({
      id: "m4",
      coverageState: "needs_review",
      isSolar: true,
      periods: [period({ demandCents: 250 })],
    });
    expect(toDrawerDetail(unreconciled).solar.demandOwedCents).toBeNull();

    // No demand billed: absence, not a zero claim.
    const noDemand = meter({ id: "m5", coverageState: "reconciled", isSolar: true });
    expect(toDrawerDetail(noDemand).solar.demandOwedCents).toBeNull();

    // Non-solar meters never get the line.
    const nonSolar = meter({
      id: "m6",
      coverageState: "reconciled",
      periods: [period({ demandCents: 250 })],
    });
    expect(toDrawerDetail(nonSolar).solar.demandOwedCents).toBeNull();
  });

  it("passes the printed true-up amount through", () => {
    const d = toDrawerDetail(
      meter({ id: "m7", coverageState: "reconciled", isSolar: true, trueUpAmountCents: 713031 }),
    );
    expect(d.solar.trueUpAmountCents).toBe(713031);
  });

  // E-2 (FR21/FR23): the floor (the charges solar never offsets) as a labeled-group
  // value, and the uncovered share beside the demand charge - both honest-blank where the
  // demand dollar is not quotable, never a fabricated floor or a fake 100% share.
  it("builds the floor group and the uncovered share for a reconciled solar meter with demand", () => {
    const m = meter({
      id: "f1",
      coverageState: "reconciled",
      isSolar: true,
      periods: [
        period({
          demandCents: 250,
          lineItems: [
            li({ kind: "demand", amountCents: 250, unit: "kW" }),
            li({ kind: "other", label: "Customer Charge", amountCents: 4300 }),
            li({ kind: "nbc", label: "PCIA", amountCents: 90 }),
            li({ kind: "tou_energy", label: "Peak", amountCents: 750, unit: "kWh" }),
          ],
        }),
      ],
    });
    const d = toDrawerDetail(m);
    expect(d.solar.demandOwedCents).toBe(250);
    expect(d.solar.floor).toEqual({
      demandCents: 250,
      serviceCents: 4300,
      nbcCents: 90,
      totalCents: 250 + 4300 + 90,
    });
    // demand 250 / (250 + 750 offsettable) = 0.25 of the bill solar does not cover.
    expect(d.solar.uncoveredShare).toBeCloseTo(0.25);
  });

  it("leaves the floor and share honest-blank where the demand dollar is not quotable", () => {
    // Reconciled solar meter, but no demand billed: floor null, share null.
    const noDemand = meter({
      id: "f2",
      coverageState: "reconciled",
      isSolar: true,
      periods: [period({ lineItems: [li({ kind: "tou_energy", amountCents: 750, unit: "kWh" })] })],
    });
    expect(noDemand.coverageState).toBe("reconciled");
    expect(toDrawerDetail(noDemand).solar.floor).toBeNull();
    expect(toDrawerDetail(noDemand).solar.uncoveredShare).toBeNull();

    // Unreconciled: withheld even with demand line items (AR-15).
    const unrec = meter({
      id: "f3",
      coverageState: "needs_review",
      isSolar: true,
      periods: [period({ demandCents: 250, lineItems: [li({ kind: "demand", amountCents: 250 })] })],
    });
    expect(toDrawerDetail(unrec).solar.floor).toBeNull();
    expect(toDrawerDetail(unrec).solar.uncoveredShare).toBeNull();
  });

  it("leaves the share null when no offsettable energy is on file (never a fake 100%)", () => {
    const m = meter({
      id: "f4",
      coverageState: "reconciled",
      isSolar: true,
      periods: [
        period({
          demandCents: 250,
          lineItems: [
            li({ kind: "demand", amountCents: 250 }),
            li({ kind: "other", label: "Customer Charge", amountCents: 4300 }),
          ],
        }),
      ],
    });
    const d = toDrawerDetail(m);
    expect(d.solar.floor?.totalCents).toBe(4550);
    expect(d.solar.uncoveredShare).toBeNull(); // no TOU energy -> share fails closed
  });
});

describe("toDrawerDetail DR enrollment (Story 3.7)", () => {
  it("reads the LATEST period only: a stale credit on an old bill never presents as current", () => {
    // Old bill printed PDP; the latest prints nothing -> not enrolled now.
    const lapsed = toDrawerDetail(
      meter({
        id: "m0",
        coverageState: "reconciled",
        periods: [
          period({
            start: "2025-01-01T00:00:00.000Z",
            lineItems: [li({ kind: "other", label: "PDP Event Day Credit 06/12", amountCents: -500 })],
          }),
          period({}),
        ],
      }),
    );
    expect(lapsed.drProgram).toBeNull();
    // And the current program wins over an older different one.
    const switched = toDrawerDetail(
      meter({
        id: "m0b",
        coverageState: "reconciled",
        periods: [
          period({
            start: "2025-01-01T00:00:00.000Z",
            lineItems: [li({ kind: "other", label: "PDP Event Day Credit", amountCents: -500 })],
          }),
          period({
            start: "2026-01-01T00:00:00.000Z",
            lineItems: [li({ kind: "other", label: "BIP Incentive", amountCents: -100 })],
          }),
        ],
      }),
    );
    expect(switched.drProgram).toBe("bip");
  });

  it("detects a printed program line on the latest period; absent stays null", () => {
    const enrolled = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "reconciled",
        periods: [
          period({}),
          period({
            start: "2026-01-01T00:00:00.000Z",
            lineItems: [li({ kind: "other", label: "PDP Event Day Credit 06/12", amountCents: -500 })],
          }),
        ],
      }),
    );
    expect(enrolled.drProgram).toBe("pdp");

    const none = toDrawerDetail(
      meter({
        id: "m2",
        coverageState: "reconciled",
        periods: [period({ lineItems: [li({ kind: "other", label: "Energy Commission Tax", amountCents: 1 })] })],
      }),
    );
    expect(none.drProgram).toBeNull();
  });

  it("a printed enrollment is a fact, not a figure: visible even when unreconciled", () => {
    const d = toDrawerDetail(
      meter({
        id: "m3",
        coverageState: "needs_review",
        periods: [period({ lineItems: [li({ kind: "other", label: "BIP Incentive", amountCents: -100 })] })],
      }),
    );
    expect(d.drProgram).toBe("bip");
    expect(d.latest).toBeNull(); // the cent gate still withholds the figures
  });
});

// ---------------------------------------------------------------------------
// Bill-accuracy verification deriver (Story 4.1, FR-19).
// ---------------------------------------------------------------------------

function verifyPlan(
  over: Partial<RatePlan> & Pick<RatePlan, "schedule" | "family" | "sizeClass">,
): RatePlan {
  return {
    legacy: false,
    agricultural: true,
    customerChargePerMonth: 42,
    customerChargePerDay: 1.4,
    summer: { energy: { peak: 0.4, partial_peak: 0.3, off_peak: 0.2 }, demand: { maxDemandPerKw: 20 } },
    winter: { energy: { peak: 0.3, partial_peak: 0.25, off_peak: 0.15 }, demand: { maxDemandPerKw: 20 } },
    ...over,
  };
}

// "AGC" (the meter helper's rateSchedule) maps to the AG-C2 large card row.
const VERIFY_CARD: RateCard = {
  utility: "PG&E",
  effectiveDate: "2026-03-01",
  version: "test-1",
  source: "hand-built test card",
  summerMonths: [5, 6, 7, 8, 9, 10],
  sizeBreakKw: 35,
  plans: [
    verifyPlan({ schedule: "AG-A1", family: "AG-A", sizeClass: "small" }),
    verifyPlan({ schedule: "AG-A2", family: "AG-A", sizeClass: "large" }),
    verifyPlan({ schedule: "AG-B1", family: "AG-B", sizeClass: "small" }),
    verifyPlan({ schedule: "AG-B2", family: "AG-B", sizeClass: "large" }),
    verifyPlan({ schedule: "AG-C1", family: "AG-C", sizeClass: "small" }),
    verifyPlan({ schedule: "AG-C2", family: "AG-C", sizeClass: "large" }),
    verifyPlan({ schedule: "AG-4", family: "AG-4", sizeClass: "small", legacy: true }),
    verifyPlan({ schedule: "AG-4", family: "AG-4", sizeClass: "large", legacy: true }),
    verifyPlan({ schedule: "AG-5", family: "AG-5", sizeClass: "small", legacy: true }),
    verifyPlan({ schedule: "AG-5", family: "AG-5", sizeClass: "large", legacy: true }),
  ],
};

// A winter cycle (Feb 11 - Mar 12, 30 inclusive days) with 100 kWh off-peak. The
// AG-C2 card prices it independently, so the on-band print is exactly that figure.
const AGC2 = VERIFY_CARD.plans.find((p) => p.schedule === "AG-C2")!;
const RECONCILED_TOTAL = priceCycleCents(
  { days: 30, season: "winter", energyKwh: { off_peak: 100 }, maxDemandKw: null },
  AGC2,
).totalCents;

function billPeriod(over: Partial<MeterPeriodView> = {}): MeterPeriodView {
  return period({
    start: "2026-02-11T00:00:00.000Z",
    close: "2026-03-12T00:00:00.000Z",
    printedTotalCents: RECONCILED_TOTAL,
    lineItems: [
      li({ kind: "other", label: "Customer Charge 30 days @ $1.40", amountCents: 4200 }),
      li({ kind: "tou_energy", label: "Off-Peak", quantity: 100, unit: "kWh", amountCents: 1500 }),
    ],
    ...over,
  });
}

describe("verificationFor", () => {
  it("verifies a reconciled, non-solar, on-band meter (badge will render)", () => {
    const v = verificationFor(
      meter({ id: "m1", coverageState: "reconciled", periods: [billPeriod()] }),
      VERIFY_CARD,
    );
    expect(v).not.toBeNull();
    expect(v?.verified).toBe(true);
    expect(v?.printedTotalCents).toBe(RECONCILED_TOTAL);
  });

  it("returns null for a solar meter (isSolar) - true-up settles off the monthly page", () => {
    const v = verificationFor(
      meter({ id: "m1", coverageState: "reconciled", isSolar: true, periods: [billPeriod()] }),
      VERIFY_CARD,
    );
    expect(v).toBeNull();
  });

  it("returns null for a solar meter flagged only by solarKw", () => {
    const v = verificationFor(
      meter({ id: "m1", coverageState: "reconciled", solarKw: 840, periods: [billPeriod()] }),
      VERIFY_CARD,
    );
    expect(v).toBeNull();
  });

  it("returns null for an unreconciled meter (the AR-15 gate)", () => {
    expect(
      verificationFor(
        meter({ id: "m1", coverageState: "needs_review", periods: [billPeriod()] }),
        VERIFY_CARD,
      ),
    ).toBeNull();
    expect(
      verificationFor(meter({ id: "m1", coverageState: "no_bill", periods: [] }), VERIFY_CARD),
    ).toBeNull();
  });

  it("carries verified:false for an off-band bill (the component still renders no badge)", () => {
    const v = verificationFor(
      meter({
        id: "m1",
        coverageState: "reconciled",
        periods: [billPeriod({ printedTotalCents: RECONCILED_TOTAL * 2 })],
      }),
      VERIFY_CARD,
    );
    expect(v).not.toBeNull();
    expect(v?.verified).toBe(false);
  });

  it("returns null when the meter has no periods", () => {
    expect(
      verificationFor(meter({ id: "m1", coverageState: "reconciled", periods: [] }), VERIFY_CARD),
    ).toBeNull();
  });

  it("verifies the LATEST period, not an earlier one (the bill on screen)", () => {
    // An off-band older cycle followed by an on-band latest cycle -> verified.
    const older = billPeriod({
      start: "2026-01-11T00:00:00.000Z",
      close: "2026-02-10T00:00:00.000Z",
      printedTotalCents: RECONCILED_TOTAL * 3,
    });
    const v = verificationFor(
      meter({ id: "m1", coverageState: "reconciled", periods: [older, billPeriod()] }),
      VERIFY_CARD,
    );
    expect(v?.verified).toBe(true);
  });

  it("stays null for a solar meter regardless of layout (the drawer solar section never shows a verify badge, A-9)", () => {
    // A-9 acceptance: verificationFor correctly stays null for solar meters, so the drawer's
    // d.showSolar block carries the legibility (program/nameplate/array) but no bill-verify badge.
    expect(
      verificationFor(
        meter({ id: "s1", coverageState: "reconciled", isSolar: true, periods: [billPeriod()] }),
        VERIFY_CARD,
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A-9: the drawer solar section extension (program code, nameplate, array;
// allocation + credit honest-blank). FR4, FR3/FR2, partial FR10.
// ---------------------------------------------------------------------------

describe("resolveDrawerProgram (A-9, FR2/FR5)", () => {
  it("resolves each recognized granular six-code to that exact code, case-insensitively", () => {
    for (const code of ["NEM2AA", "NEM2AG", "NEM2M", "NEMEXPM", "NEMEXP", "NEMS"]) {
      expect(resolveDrawerProgram(code)).toEqual({ kind: "granular", code });
      expect(resolveDrawerProgram(code.toLowerCase())).toEqual({ kind: "granular", code });
    }
  });

  it("resolves the generic nem2-family token to generic, never a guessed granular code", () => {
    expect(resolveDrawerProgram("nem2")).toEqual({ kind: "generic", raw: "nem2" });
    expect(resolveDrawerProgram("NEM2")).toEqual({ kind: "generic", raw: "NEM2" });
    expect(resolveDrawerProgram("nem2_agg")).toEqual({ kind: "generic", raw: "nem2_agg" });
  });

  it("resolves a null, blank, or unrecognized token to unknown (not-on-file, never inferred)", () => {
    expect(resolveDrawerProgram(null)).toEqual({ kind: "unknown" });
    expect(resolveDrawerProgram("")).toEqual({ kind: "unknown" });
    expect(resolveDrawerProgram("   ")).toEqual({ kind: "unknown" });
    expect(resolveDrawerProgram("nem3")).toEqual({ kind: "unknown" });
    expect(resolveDrawerProgram("something-else")).toEqual({ kind: "unknown" });
  });

  it("never infers one meter's code from another (each token resolves only from itself)", () => {
    // Two adjacent tokens resolve independently: a granular meter beside an absent one does not
    // lend its code, and vice-versa. The function takes only its own raw value (no cross-meter read).
    expect(resolveDrawerProgram("NEM2AA")).toEqual({ kind: "granular", code: "NEM2AA" });
    expect(resolveDrawerProgram(null)).toEqual({ kind: "unknown" });
  });
});

describe("toDrawerDetail solar legibility (A-9, FR2/FR3/FR4)", () => {
  it("feeds the program code, nameplate, and array membership the list shows", () => {
    const d = toDrawerDetail(
      meter({
        id: "m1",
        coverageState: "no_bill",
        isSolar: true,
        nemType: "nem2",
        solarKw: 840,
        benefitingArrays: [
          {
            id: "arr1",
            name: "West Array",
            nameplateKw: 840,
            nemType: "nem2",
            trueUpMonth: 4,
            interconnectionDate: null,
          },
        ],
      }),
    );
    expect(d.solar.program).toEqual({ kind: "generic", raw: "nem2" });
    expect(d.solar.solarKw).toBe(840);
    expect(d.solar.arrays).toEqual([{ id: "arr1", name: "West Array", nameplateKw: 840 }]);
  });

  it("renders absent program and nameplate as the unknown/not-on-file state, never a guess (FR4)", () => {
    // A solar-flagged meter with no NEM token and no paired nameplate: the program is unknown
    // (the component renders not-on-file) and the nameplate stays null (FieldRow reads not-on-file).
    const d = toDrawerDetail(meter({ id: "m2", coverageState: "no_bill", isSolar: true }));
    expect(d.solar.program).toEqual({ kind: "unknown" });
    expect(d.solar.solarKw).toBeNull();
    expect(d.solar.arrays).toEqual([]);
  });

  it("keeps the allocation share honest-blank (always null at A-9, the real value is C-2, FR10)", () => {
    // Even a fully-populated solar meter carries no allocation share at this story: the drawer
    // renders the honest-blank allocation + credit rows, never a fabricated split or a credit dollar.
    const d = toDrawerDetail(
      meter({
        id: "m3",
        coverageState: "reconciled",
        isSolar: true,
        nemType: "NEM2AA",
        solarKw: 1092,
        trueUpAmountCents: 500000,
        benefitingArrays: [
          {
            id: "arr2",
            name: "South Array",
            nameplateKw: 1092,
            nemType: "nem2",
            trueUpMonth: 9,
            interconnectionDate: null,
          },
        ],
      }),
    );
    expect(d.solar.allocationShare).toBeNull();
    expect(d.solar.program).toEqual({ kind: "granular", code: "NEM2AA" });
  });

  it("renders the grandfather position honest-unknown by default (no asOf, no PTO date - F-1/F-3)", () => {
    const arr = { id: "arr1", name: "West", nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: null };
    const m1 = meter({ id: "m1", coverageState: "reconciled", isSolar: true, benefitingArrays: [arr] });
    expect(toDrawerDetail(m1, [m1]).solar.grandfather).toEqual({ state: "unknown" });
  });

  it("computes the grandfather countdown when asOf + a single NEM2 array's PTO date are on file (F-1/F-3)", () => {
    const arr = {
      id: "arr1",
      name: "West",
      nameplateKw: 840,
      nemType: "nem2_agg",
      trueUpMonth: 9,
      interconnectionDate: "2018-03-01T00:00:00.000Z",
    };
    const m1 = meter({ id: "m1", coverageState: "reconciled", isSolar: true, benefitingArrays: [arr] });
    const d = toDrawerDetail(m1, [m1], "2026-06-20T12:00:00.000Z");
    expect(d.solar.grandfather).toEqual({ state: "known", expiryYear: 2038, yearsRemaining: 11 });
  });

  it("stays honest-unknown for a meter under more than one array (cannot say which vintage is its)", () => {
    const west = { id: "w", name: "West", nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: "2018-03-01T00:00:00.000Z" };
    const east = { id: "e", name: "East", nameplateKw: 1092, nemType: "nem2_agg", trueUpMonth: 9, interconnectionDate: "2019-01-01T00:00:00.000Z" };
    const m1 = meter({ id: "m1", coverageState: "reconciled", isSolar: true, benefitingArrays: [west, east] });
    expect(toDrawerDetail(m1, [m1], "2026-06-20T12:00:00.000Z").solar.grandfather).toEqual({ state: "unknown" });
  });
});
