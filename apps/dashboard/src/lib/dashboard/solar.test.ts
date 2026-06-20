import { describe, expect, it } from "vitest";
import {
  buildSolarDataset,
  isTrueUpSoon,
  nextTrueUpAcross,
  TRUE_UP_SOON_MONTHS,
  type SolarMeterView,
} from "./solar";
import type { MeterView, MeterArrayView } from "./load";

// A-3: the solar lens dataset is a PURE derivation over MeterView[]. These tests pin isSolar-only
// membership, count correctness at scale, the array-to-meter grouping (incl. cross-entity), the
// injected-now next-true-up, and the needs-review count - and assert no credit dollar is ever
// produced (honest-blank, FR10).

function array(over: Partial<MeterArrayView> & { id: string }): MeterArrayView {
  return { name: over.id, nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: null, ...over };
}

/** A per-cycle summary carrying just the totalKwh the allocation share reads (C-2, NFR4). */
function period(totalKwh: number | null): MeterView["periods"][number] {
  return {
    start: "2025-01-01T00:00:00.000Z",
    close: "2025-02-01T00:00:00.000Z",
    printedTotalCents: null,
    demandCents: null,
    totalKwh,
    peakKw: null,
    tariff: null,
    lineItems: [],
  };
}

function meter(over: Partial<MeterView> & { id: string; isSolar: boolean }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "reconciled",
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
    cropName: null,
    latitude: null,
    longitude: null,
    gpm: null,
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

describe("buildSolarDataset - membership and count (FR1)", () => {
  it("includes every isSolar meter and no non-solar meter", () => {
    const ds = buildSolarDataset(
      [
        meter({ id: "solar-1", isSolar: true }),
        meter({ id: "plain-1", isSolar: false }),
        meter({ id: "solar-2", isSolar: true }),
        meter({ id: "plain-2", isSolar: false }),
      ],
      1,
    );
    expect(ds.meters.map((m) => m.id)).toEqual(["solar-1", "solar-2"]);
    expect(ds.kpis.solarMeterCount).toBe(2);
  });

  it("count is correct at 183-meter scale with a known solar subset", () => {
    const all = Array.from({ length: 183 }, (_, i) =>
      // Every 5th meter is solar -> 37 solar meters (ceil(183/5)).
      meter({ id: `m${i}`, isSolar: i % 5 === 0 }),
    );
    const expectedSolar = all.filter((m) => m.isSolar).length;
    const ds = buildSolarDataset(all, 6);
    expect(ds.meters).toHaveLength(expectedSolar);
    expect(ds.kpis.solarMeterCount).toBe(expectedSolar);
    expect(ds.meters.every((m) => all.find((a) => a.id === m.id)?.isSolar)).toBe(true);
  });

  it("an empty farm yields empty arrays and zero counts, never a crash", () => {
    const ds = buildSolarDataset([], 1);
    expect(ds.meters).toEqual([]);
    expect(ds.arrays).toEqual([]);
    expect(ds.kpis).toEqual({
      solarMeterCount: 0,
      arrayCount: 0,
      nextTrueUp: null,
      needsReviewCount: 0,
    });
  });
});

describe("buildSolarDataset - array grouping (FR7)", () => {
  it("groups meters under the arrays they benefit from, including across entities", () => {
    const west = array({ id: "West", nameplateKw: 1092, trueUpMonth: 9 });
    const ds = buildSolarDataset(
      [
        meter({ id: "p1", isSolar: true, entityName: "Batth LLC", benefitingArrays: [west] }),
        meter({ id: "p2", isSolar: true, entityName: "Other Entity LLC", benefitingArrays: [west] }),
        meter({ id: "p3", isSolar: false, benefitingArrays: [west] }), // non-solar excluded
      ],
      1,
    );
    expect(ds.arrays).toHaveLength(1);
    const group = ds.arrays[0];
    if (!group) throw new Error("missing array group");
    expect(group.id).toBe("West");
    expect(group.nameplateKw).toBe(1092);
    expect(group.trueUpMonth).toBe(9);
    // Cross-entity meters are grouped together (display-only, no eligibility rule); the non-solar
    // meter is not in the group because it is filtered out of the solar set entirely.
    expect(group.meters.map((m) => m.pumpId).sort()).toEqual(["p1", "p2"]);
  });

  it("a meter under two arrays appears in both groups; groups are deduped by id", () => {
    const west = array({ id: "West" });
    const east = array({ id: "East" });
    const ds = buildSolarDataset(
      [
        meter({ id: "p1", isSolar: true, benefitingArrays: [west, east] }),
        meter({ id: "p2", isSolar: true, benefitingArrays: [west] }),
      ],
      1,
    );
    expect(ds.arrays.map((a) => a.id)).toEqual(["East", "West"]); // sorted by name
    expect(ds.kpis.arrayCount).toBe(2);
    const eastGroup = ds.arrays.find((a) => a.id === "East");
    const westGroup = ds.arrays.find((a) => a.id === "West");
    expect(eastGroup?.meters.map((m) => m.pumpId)).toEqual(["p1"]);
    expect(westGroup?.meters.map((m) => m.pumpId).sort()).toEqual(["p1", "p2"]);
  });

  it("a meter's null nameplate stays null in the row, never inferred from an array code (FR3)", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, solarKw: null, benefitingArrays: [west] })],
      1,
    );
    expect(ds.arrays[0]?.meters[0]?.solarKw).toBeNull();
  });
});

describe("buildSolarDataset - needs-review count (UX-DR2)", () => {
  it("counts solar meters not linked to any array; zero when all linked", () => {
    const west = array({ id: "West" });
    const linkedOnly = buildSolarDataset(
      [
        meter({ id: "p1", isSolar: true, benefitingArrays: [west] }),
        meter({ id: "p2", isSolar: true, benefitingArrays: [west] }),
      ],
      1,
    );
    expect(linkedOnly.kpis.needsReviewCount).toBe(0);

    const withUnlinked = buildSolarDataset(
      [
        meter({ id: "p1", isSolar: true, benefitingArrays: [west] }),
        meter({ id: "p2", isSolar: true, benefitingArrays: [] }),
      ],
      1,
    );
    expect(withUnlinked.kpis.needsReviewCount).toBe(1);
  });
});

describe("nextTrueUpAcross - injected now, no clock (UX-DR2)", () => {
  function sm(over: Partial<SolarMeterView> & { id: string }): SolarMeterView {
    return {
      name: over.id,
      accountNumber: null,
      entityName: null,
      ranchName: null,
      solarKw: null,
      nemType: null,
      trueUpMonth: null,
      hasArray: false,
      ...over,
    };
  }

  it("returns the nearest upcoming month and its settling count", () => {
    const next = nextTrueUpAcross(
      [sm({ id: "a", trueUpMonth: 9 }), sm({ id: "b", trueUpMonth: 12 }), sm({ id: "c", trueUpMonth: 9 })],
      6,
    );
    expect(next).toEqual({ month: 9, meterCount: 2, monthsAhead: 3 });
  });

  it("wraps past December to the earliest month next year", () => {
    const next = nextTrueUpAcross([sm({ id: "a", trueUpMonth: 2 })], 11);
    expect(next).toEqual({ month: 2, meterCount: 1, monthsAhead: 3 });
  });

  it("a meter settling this month is 0 months ahead", () => {
    const next = nextTrueUpAcross([sm({ id: "a", trueUpMonth: 6 })], 6);
    expect(next).toEqual({ month: 6, meterCount: 1, monthsAhead: 0 });
  });

  it("null when no meter has a true-up month on file (honest absence)", () => {
    expect(nextTrueUpAcross([sm({ id: "a", trueUpMonth: null })], 6)).toBeNull();
    expect(nextTrueUpAcross([], 6)).toBeNull();
  });

  it("ignores an out-of-range month rather than guessing", () => {
    expect(nextTrueUpAcross([sm({ id: "a", trueUpMonth: 0 }), sm({ id: "b", trueUpMonth: 13 })], 1)).toBeNull();
  });
});

describe("isTrueUpSoon - the Map lens true-up-soon signal (FR35)", () => {
  const stubMeter: SolarMeterView = {
    id: "stub",
    name: "stub",
    accountNumber: null,
    entityName: null,
    ranchName: null,
    solarKw: null,
    nemType: null,
    trueUpMonth: null,
    hasArray: false,
  };

  it("is true within the window (inclusive of this month) and false beyond it", () => {
    // Window is TRUE_UP_SOON_MONTHS whole months ahead, inclusive of the current month.
    expect(TRUE_UP_SOON_MONTHS).toBe(3);
    // now = June (6): June (0 ahead), July (1), August (2) are soon; September (3) is not.
    expect(isTrueUpSoon(6, 6)).toBe(true);
    expect(isTrueUpSoon(7, 6)).toBe(true);
    expect(isTrueUpSoon(8, 6)).toBe(true);
    expect(isTrueUpSoon(9, 6)).toBe(false);
    // A true-up 11 months out (last month before wrapping back) is not soon.
    expect(isTrueUpSoon(5, 6)).toBe(false);
  });

  it("wraps across the year boundary the same way the next-true-up window does", () => {
    // now = November (11): Nov (0), Dec (1), Jan (2) are soon; Feb (3) is not.
    expect(isTrueUpSoon(11, 11)).toBe(true);
    expect(isTrueUpSoon(12, 11)).toBe(true);
    expect(isTrueUpSoon(1, 11)).toBe(true);
    expect(isTrueUpSoon(2, 11)).toBe(false);
  });

  it("agrees with nextTrueUpAcross on what counts as within the window", () => {
    // A meter the dataset reports as 2 months ahead is soon; one 3 ahead is not.
    const soon = nextTrueUpAcross([{ ...stubMeter, trueUpMonth: 8 }], 6);
    expect(soon?.monthsAhead).toBe(2);
    expect(isTrueUpSoon(8, 6)).toBe(true);
    const notSoon = nextTrueUpAcross([{ ...stubMeter, trueUpMonth: 9 }], 6);
    expect(notSoon?.monthsAhead).toBe(3);
    expect(isTrueUpSoon(9, 6)).toBe(false);
  });

  it("is never soon for honest absence or an out-of-range month (never guessed)", () => {
    expect(isTrueUpSoon(null, 6)).toBe(false);
    expect(isTrueUpSoon(0, 6)).toBe(false);
    expect(isTrueUpSoon(13, 6)).toBe(false);
    expect(isTrueUpSoon(6, 0)).toBe(false); // out-of-range now
  });
});

describe("buildSolarDataset - honest-blank discipline (FR10)", () => {
  it("carries the C-2 usage share but NEVER a credit dollar on a meter row", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, trueUpAmountCents: -713031, benefitingArrays: [west] })],
      1,
    );
    const row = ds.arrays[0]?.meters[0];
    if (!row) throw new Error("missing row");
    // The row carries STRUCTURE plus the usage-proportional share (C-2): never a credit dollar key.
    expect(Object.keys(row).sort()).toEqual(["meterName", "nemType", "pumpId", "share", "solarKw"]);
    // And the KPI summary carries no dollar tile of any kind.
    expect(Object.keys(ds.kpis).sort()).toEqual([
      "arrayCount",
      "needsReviewCount",
      "nextTrueUp",
      "solarMeterCount",
    ]);
  });

  it("reads no interval series - the input type carries only per-cycle summaries (NFR4)", () => {
    // Structural guarantee: MeterView exposes `periods` (per-cycle summaries) and no interval field.
    // The dataset path touches membership + benefitingArrays + trueUpMonth, never an interval series.
    const ds = buildSolarDataset([meter({ id: "p1", isSolar: true })], 1);
    expect(ds.meters).toHaveLength(1);
  });
});

describe("buildSolarDataset - Arrays-lens array-group shape (A-5, FR3/FR7)", () => {
  it("exposes the array header fields the Arrays-lens card renders (name, nameplate, true-up)", () => {
    const west = array({ id: "West Array", name: "West Array", nameplateKw: 840, trueUpMonth: 9 });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, benefitingArrays: [west] })],
      1,
    );
    const group = ds.arrays[0];
    if (!group) throw new Error("missing array group");
    // The nameplate the card says in plain words ("840 kW solar") is the ARRAY nameplate, never
    // derived from a code (FR3).
    expect(group.name).toBe("West Array");
    expect(group.nameplateKw).toBe(840);
    expect(group.trueUpMonth).toBe(9);
  });

  it("a meter row's nameplate is null when not on file, never inferred from an array code (FR3)", () => {
    const west = array({ id: "West", nameplateKw: 840 });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, solarKw: null, benefitingArrays: [west] })],
      1,
    );
    const row = ds.arrays[0]?.meters[0];
    if (!row) throw new Error("missing row");
    // The ROW's own nameplate stays null even though the ARRAY has an 840 kW nameplate.
    expect(row.solarKw).toBeNull();
  });

  it("cross-entity meters appear under the same array card (FR7, display-only grouping)", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [
        meter({ id: "p1", isSolar: true, entityName: "Batth LLC", benefitingArrays: [west] }),
        meter({ id: "p2", isSolar: true, entityName: "Sandhu LLC", benefitingArrays: [west] }),
      ],
      1,
    );
    expect(ds.arrays).toHaveLength(1);
    expect(ds.arrays[0]?.meters.map((m) => m.pumpId).sort()).toEqual(["p1", "p2"]);
  });

  it("the array-group meter row carries the C-2 share but NO credit key (honest-blank, FR10)", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, benefitingArrays: [west], periods: [period(100)] })],
      1,
    );
    const row = ds.arrays[0]?.meters[0];
    if (!row) throw new Error("missing row");
    // C-2 adds the usage-proportional share; the credit DOLLAR stays honest-blank, so the dataset
    // feeds the lens no value to multiply into a dollar (FR10). The row carries structure + share.
    expect(Object.keys(row).sort()).toEqual(["meterName", "nemType", "pumpId", "share", "solarKw"]);
    expect(row.share).toBe(1);
  });

  // A-5 fix (review finding): tapping any Arrays-lens meter row writes ?meter=<pumpId> via the
  // SURFACE.meter nuqs key, and the shared MeterDrawer (now mounted in solar-dashboard.tsx) opens
  // by matching meters.find((m) => m.id === meterId). The open is only reachable if the id space the
  // row writes is the SAME id space the drawer matches on: SolarArrayGroup row pumpId === the source
  // MeterView.id. This pins that contract so the row tap -> drawer open can never silently break.
  it("every array-group row pumpId is a real source MeterView.id (the drawer-open id contract)", () => {
    const west = array({ id: "West" });
    const east = array({ id: "East" });
    const sourceMeters = [
      meter({ id: "pump-aaa", isSolar: true, benefitingArrays: [west, east] }),
      meter({ id: "pump-bbb", isSolar: true, benefitingArrays: [west] }),
      meter({ id: "plain-ccc", isSolar: false }), // non-solar: never a row, never openable here
    ];
    const ds = buildSolarDataset(sourceMeters, 1);
    const sourceIds = new Set(sourceMeters.map((m) => m.id));
    const rowPumpIds = ds.arrays.flatMap((a) => a.meters.map((m) => m.pumpId));
    expect(rowPumpIds.length).toBeGreaterThan(0);
    // Every id a row tap would write to ?meter= resolves to a real meter the drawer can find,
    // and is a SOLAR meter (a row never points at a non-solar meter).
    for (const pumpId of rowPumpIds) {
      expect(sourceIds.has(pumpId)).toBe(true);
      expect(sourceMeters.find((m) => m.id === pumpId)?.isSolar).toBe(true);
    }
    // And the same holds for the flat solar-meter view the KPI/needs-review surfaces read.
    for (const m of ds.meters) {
      expect(sourceIds.has(m.id)).toBe(true);
    }
  });
});

describe("buildSolarDataset - DM4 nameplate verification branch (C-1, FR6)", () => {
  it("fail-closed: nameplate is UNVERIFIED with no context (the cautious default)", () => {
    const ds = buildSolarDataset([meter({ id: "p1", isSolar: true, solarKw: 840 })], 1);
    expect(ds.nameplateVerified).toBe(false);
  });

  it("UNVERIFIED when the farm's solarLayoutVerifiedAt flag is null/false (cautious branch)", () => {
    const ds = buildSolarDataset([meter({ id: "p1", isSolar: true, solarKw: 840 })], 1, {
      nameplateVerified: false,
    });
    expect(ds.nameplateVerified).toBe(false);
    // The nameplate value is NEVER suppressed even when unverified - it is shown cautiously, so the
    // meter row still carries the figure; only the render adds the "unverified layout" qualifier.
    expect(ds.meters[0]?.solarKw).toBe(840);
  });

  it("VERIFIED when the flag carries a date (nameplateVerified=true)", () => {
    const ds = buildSolarDataset([meter({ id: "p1", isSolar: true, solarKw: 840 })], 1, {
      nameplateVerified: true,
    });
    expect(ds.nameplateVerified).toBe(true);
    expect(ds.meters[0]?.solarKw).toBe(840);
  });
});

describe("buildSolarDataset - needs-review surfacing (C-1, FR6)", () => {
  it("surfaces an unlinked solar meter (no array) as a needs-review row", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [
        meter({ id: "linked", isSolar: true, benefitingArrays: [west] }),
        meter({ id: "orphan", isSolar: true, benefitingArrays: [] }),
      ],
      1,
    );
    expect(ds.needsReview.unlinkedMeters.map((m) => m.id)).toEqual(["orphan"]);
    expect(ds.needsReview.unlinkedCodes).toEqual([]);
    // The unlinked-meter set is exactly the set that drives the needs-review count.
    expect(ds.kpis.needsReviewCount).toBe(1);
  });

  it("surfaces importInventory's unlinked NEMA codes (deduped, sorted) as needs-review rows", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, benefitingArrays: [west] })],
      1,
      { unlinkedNemaCodes: ["GHOST", "AGG-Z", "GHOST", " ", ""] },
    );
    // Verbatim codes, deduped, sorted; blanks dropped (never a guessed/fabricated code).
    expect(ds.needsReview.unlinkedCodes.map((c) => c.code)).toEqual(["AGG-Z", "GHOST"]);
    // A referenced-but-unlinked code is a needs-review gap on top of any unlinked meters.
    expect(ds.kpis.needsReviewCount).toBe(2);
  });

  it("counts BOTH unlinked meters and unlinked codes toward needs-review (never silently dropped)", () => {
    const ds = buildSolarDataset(
      [meter({ id: "orphan", isSolar: true, benefitingArrays: [] })],
      1,
      { unlinkedNemaCodes: ["GHOST"] },
    );
    expect(ds.needsReview.unlinkedMeters.map((m) => m.id)).toEqual(["orphan"]);
    expect(ds.needsReview.unlinkedCodes.map((c) => c.code)).toEqual(["GHOST"]);
    expect(ds.kpis.needsReviewCount).toBe(2);
  });

  it("is calm (empty + zero) when every meter is linked and no code is unlinked", () => {
    const west = array({ id: "West" });
    const ds = buildSolarDataset(
      [meter({ id: "p1", isSolar: true, benefitingArrays: [west] })],
      1,
      { unlinkedNemaCodes: [] },
    );
    expect(ds.needsReview.unlinkedMeters).toEqual([]);
    expect(ds.needsReview.unlinkedCodes).toEqual([]);
    expect(ds.kpis.needsReviewCount).toBe(0);
  });
});

describe("buildSolarDataset - usage-proportional allocation share (C-2, FR8)", () => {
  it("splits an array's meters by their cumulative totalKwh: A/(A+B), B/(A+B), summing to 1", () => {
    const west = array({ id: "West", name: "West" });
    const ds = buildSolarDataset(
      [
        // p1: 12 + 18 = 30 kWh; p2: 10 kWh -> 0.75 / 0.25
        meter({ id: "p1", isSolar: true, benefitingArrays: [west], periods: [period(12), period(18)] }),
        meter({ id: "p2", isSolar: true, benefitingArrays: [west], periods: [period(10)] }),
      ],
      1,
    );
    const rows = ds.arrays[0]?.meters ?? [];
    expect(rows.find((r) => r.pumpId === "p1")?.share).toBe(0.75);
    expect(rows.find((r) => r.pumpId === "p2")?.share).toBe(0.25);
    const sum = rows.reduce((acc, r) => acc + (r.share ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("a meter with no billed usage on file is not-on-file (share null), never a fabricated zero", () => {
    const west = array({ id: "West", name: "West" });
    const ds = buildSolarDataset(
      [
        meter({ id: "p1", isSolar: true, benefitingArrays: [west], periods: [period(40)] }),
        // no periods => cumulativeKwh null => excluded from the denominator, share null
        meter({ id: "p2", isSolar: true, benefitingArrays: [west], periods: [] }),
      ],
      1,
    );
    const rows = ds.arrays[0]?.meters ?? [];
    expect(rows.find((r) => r.pumpId === "p1")?.share).toBe(1);
    expect(rows.find((r) => r.pumpId === "p2")?.share).toBeNull();
  });

  it("computes each array's share independently when a meter sits under two arrays", () => {
    const west = array({ id: "West", name: "West" });
    const east = array({ id: "East", name: "East" });
    const ds = buildSolarDataset(
      [
        // p1 (60) is under both; p2 (40) under West only; p3 (60) under East only.
        meter({ id: "p1", isSolar: true, benefitingArrays: [west, east], periods: [period(60)] }),
        meter({ id: "p2", isSolar: true, benefitingArrays: [west], periods: [period(40)] }),
        meter({ id: "p3", isSolar: true, benefitingArrays: [east], periods: [period(60)] }),
      ],
      1,
    );
    const westGroup = ds.arrays.find((g) => g.id === "West");
    const eastGroup = ds.arrays.find((g) => g.id === "East");
    // West: p1 60 / (60 + 40) = 0.6, p2 = 0.4.
    expect(westGroup?.meters.find((r) => r.pumpId === "p1")?.share).toBe(0.6);
    expect(westGroup?.meters.find((r) => r.pumpId === "p2")?.share).toBe(0.4);
    // East: p1 60 / (60 + 60) = 0.5, p3 = 0.5.
    expect(eastGroup?.meters.find((r) => r.pumpId === "p1")?.share).toBe(0.5);
    expect(eastGroup?.meters.find((r) => r.pumpId === "p3")?.share).toBe(0.5);
  });

  it("never multiplies a share by a dollar: a meter with a true-up credit still carries no credit key", () => {
    const west = array({ id: "West", name: "West" });
    const ds = buildSolarDataset(
      [
        meter({
          id: "p1",
          isSolar: true,
          trueUpAmountCents: -713031,
          benefitingArrays: [west],
          periods: [period(100)],
        }),
      ],
      1,
    );
    const row = ds.arrays[0]?.meters[0];
    if (!row) throw new Error("missing row");
    expect(row.share).toBe(1);
    // The row exposes the share, never a credit/dollar value derived from it (FR10).
    expect(Object.keys(row).sort()).toEqual(["meterName", "nemType", "pumpId", "share", "solarKw"]);
  });
});
