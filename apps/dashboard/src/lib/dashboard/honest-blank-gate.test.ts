// The release-gate test (G-4, FR26 enforced, CM1, NFR5). This is the trust contract implemented as
// a tested invariant, not a convention: for a farm with NO true-up statement on file, EVERY enumerated
// net-metering-dollar surface emits honest-blank and never a dollar, and no code path multiplies a
// percentage by a dollar to display a credit (FR10). A failing assertion here is a RELEASE BLOCKER,
// not a warning.
//
// The one law (verbatim, every story inherits it): program STRUCTURE and TIMING are in Terra's data
// today; net-metering dollar CREDITS are not. The percentage allocation shares are buildable now from
// usage; the actual credit DOLLARS stay honest-blank until a true-up statement is uploaded. This test
// asserts that law holds across the STATE the derivations emit, so no surface can drift into a zero,
// an estimate, a dash, or a percent-times-dollar credit.
//
// What this gate enumerates (the five net-metering-dollar surfaces, AC1):
//   (1) the true-up credit (the calendar cell dollar, F6/FR14) - the calendar carries STRUCTURE/TIMING
//       only, NO dollar field at all.
//   (2) the allocation credit split (FR10) - the array-group meter rows carry the usage-proportional
//       SHARE (a ratio in [0,1]), NO credit-dollar field.
//   (3) the array-card credit column (FR10) - the array group carries STRUCTURE only, NO credit dollar.
//   (4) any Net Surplus Compensation figure - must not surface (no NSC field exists on any solar shape).
//   (5) any composite "dollars saved by solar" reading - must not surface (no such field exists).
//   plus the drawer true-up amount / NEM charges, which are null until a statement settles them.
//
// The discriminator (AC2): the ALLOWED honest BILLING dollars are NOT flagged. The F2 demand-owed
// dollar (`nemDemandInsight().demandOwedCents`) is sourced from billed demand line items, not a
// NemPeriod/true-up/allocation credit, so it passes; it rides `impactNote` (never `impactUsd`), so it
// never inflates the rail's at-risk sum. A forbidden net-metering credit is a NEM credit shape sourced
// from a NemPeriod / true-up / allocation path with no statement on file.
//
// The structural assertion (AC3): the allocation share is a ratio in [0,1] the derivation returns
// ALONE; it is never multiplied by a credit-cents figure, because no credit-cents figure exists on the
// solar derivation shapes to multiply by. This test asserts both the value range AND the structural
// absence of a credit field, so the no-percent-times-dollar guarantee holds by construction.

import { describe, expect, it } from "vitest";
import { buildSolarDataset } from "./solar";
import { toDrawerDetail } from "./drawer";
import { solarMetersCsv } from "./csv";
import { allocateArray } from "@/lib/energy/solar-allocation";
import { nemDemandInsight } from "@/lib/energy/solar-nem";
import type { MeterView, MeterArrayView } from "./load";
import type { RateCard, RatePlan } from "@/lib/energy/rates";
import { en } from "@/copy/en";

// --- Fixtures: a solar farm with NO true-up statement on file (the release-gate scenario) ----------

function array(over: Partial<MeterArrayView> & { id: string }): MeterArrayView {
  return { name: over.id, nameplateKw: 840, nemType: "nem2_agg", trueUpMonth: 9, ...over };
}

/** A per-cycle summary carrying usage (totalKwh) and a billed demand charge, but NO statement-settled
 *  net-metering credit. The demand cents are a BILLED line-item dollar (the allowed kind); they are
 *  never a net-metering credit. */
function period(over: { totalKwh: number | null; demandCents?: number | null }): MeterView["periods"][number] {
  return {
    start: "2025-01-01T00:00:00.000Z",
    close: "2025-02-01T00:00:00.000Z",
    printedTotalCents: 1000,
    demandCents: over.demandCents ?? null,
    totalKwh: over.totalKwh,
    peakKw: null,
    tariff: "AGC",
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
    // The release-gate scenario: NO true-up statement settled, so no credit cents on file.
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: null,
    benefitingArrays: [],
    growerPumpId: null,
    // No printed NEM months on file: the statement has not been uploaded.
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

const WEST = array({ id: "West", nameplateKw: 1092, trueUpMonth: 9 });

/** A two-meter NEMA farm with usage on file (so a SHARE is computable) but NO statement on file (so
 *  every credit DOLLAR must stay honest-blank). nowMonth is injected (pure, no clock). */
function statementlessSolarFarm(): MeterView[] {
  return [
    meter({
      id: "p1",
      isSolar: true,
      nemType: "nem2",
      trueUpMonth: 9,
      solarKw: 200,
      benefitingArrays: [WEST],
      periods: [period({ totalKwh: 7500, demandCents: 250 })],
    }),
    meter({
      id: "p2",
      isSolar: true,
      nemType: "nem2",
      trueUpMonth: 9,
      solarKw: 100,
      benefitingArrays: [WEST],
      periods: [period({ totalKwh: 2500, demandCents: 119 })],
    }),
  ];
}

const NOW_MONTH = 6;

// The exhaustive set of money-shaped key fragments a net-metering credit would surface under. If a new
// dollar field is ever added to a solar derivation shape, this guard forces the author to confront the
// release gate: a key matching one of these in a solar value is a fabricated-credit candidate.
const CREDIT_KEY_FRAGMENTS = [
  "credit",
  "amountcents",
  "trueupamount",
  "nsc",
  "surplus",
  "saved",
  "savings",
  "creditcents",
] as const;

/** Recursively scan a plain value for any non-null numeric field whose key reads like a net-metering
 *  credit dollar. Returns the offending key paths (empty = clean). The allocation SHARE keys are
 *  explicitly allowed: a share is a ratio in [0,1], never a credit dollar. */
function findCreditDollarFields(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findCreditDollarFields(v, `${path}[${i}]`));
  }
  const offenders: string[] = [];
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = path === "" ? key : `${path}.${key}`;
    const lower = key.toLowerCase();
    // A "share" / "pct" is an allocation ratio/percent, never a credit dollar - skip it explicitly.
    const isAllocationRatio = lower.includes("share") || lower.includes("pct");
    const looksLikeCredit = CREDIT_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
    if (looksLikeCredit && !isAllocationRatio && typeof v === "number" && v !== null) {
      offenders.push(keyPath);
    }
    offenders.push(...findCreditDollarFields(v, keyPath));
  }
  return offenders;
}

// --------------------------------------------------------------------------------------------------
// (1)-(5) The enumerated net-metering-dollar surfaces emit honest-blank with no statement on file.
// --------------------------------------------------------------------------------------------------

describe("release gate: no net-metering dollar surfaces without its backing statement (FR26, CM1, NFR5)", () => {
  it("(2)+(3) the array-group credit column and allocation split carry NO credit dollar, only a share", () => {
    const ds = buildSolarDataset(statementlessSolarFarm(), NOW_MONTH);
    // Exactly one array group with both meters under it.
    expect(ds.arrays).toHaveLength(1);
    const group = ds.arrays[0];
    if (group === undefined) throw new Error("expected the West array group");

    // The array card carries STRUCTURE/TIMING only - name, nameplate, program token, true-up month -
    // and its meter rows carry the usage-proportional SHARE. There is NO credit-dollar field anywhere
    // in the array group: the credit column is honest-blank by structural absence, not by a zero.
    expect(findCreditDollarFields(group)).toEqual([]);

    // The allocation split is a SHARE (a ratio in [0,1]), present and summing to ~1 - the percentage
    // is buildable now from usage - while the credit DOLLAR is absent (honest-blank).
    const shares = group.meters.map((m) => m.share);
    expect(shares).toHaveLength(2);
    for (const s of shares) {
      expect(s).not.toBeNull();
      // A share is a ratio in [0,1], NEVER a credit dollar.
      expect(s as number).toBeGreaterThanOrEqual(0);
      expect(s as number).toBeLessThanOrEqual(1);
    }
    const sum = shares.reduce<number>((acc, s) => acc + (s ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("(1) the true-up calendar carries STRUCTURE/TIMING only, NO credit dollar (F6/FR14)", () => {
    const ds = buildSolarDataset(statementlessSolarFarm(), NOW_MONTH);
    // The calendar places the settle months and counts; it never carries a true-up credit dollar.
    expect(ds.calendar.cells.length).toBe(12);
    // The two meters both settle in September; the next-upcoming names the month and meter count,
    // never a dollar.
    expect(ds.calendar.nextUpcoming?.month).toBe(9);
    expect(ds.calendar.nextUpcoming?.meterCount).toBe(2);
    expect(findCreditDollarFields(ds.calendar)).toEqual([]);
  });

  it("(4)+(5) the whole solar dataset surfaces NO NSC and NO composite 'dollars saved by solar' figure", () => {
    const ds = buildSolarDataset(statementlessSolarFarm(), NOW_MONTH);
    // Across the entire assembled dataset (meters, arrays, kpis, calendar, needs-review): not one
    // net-metering credit dollar, NSC figure, or "saved by solar" composite. The KPI strip carries no
    // dollar tile at all (UX-DR2). This is the structural guarantee the wedge rests on.
    expect(findCreditDollarFields(ds)).toEqual([]);
  });

  it("the drawer true-up amount and NEM charges are honest-blank (null) with no statement on file", () => {
    const fleet = statementlessSolarFarm();
    const first = fleet[0];
    if (first === undefined) throw new Error("expected a meter");
    const detail = toDrawerDetail(first, fleet);
    expect(detail.showSolar).toBe(true);
    // The two net-metering CREDIT dollars on the drawer are null until a statement settles them.
    expect(detail.solar.trueUpAmountCents).toBeNull();
    expect(detail.solar.nemChargesCents).toBeNull();
    // The allocation row beside them is a SHARE (ratio in [0,1]) or honest-blank null, never a dollar.
    const share = detail.solar.allocationShare;
    if (share !== null) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });

  it("the CSV exports the allocation/credit cells as an explicit not-on-file marker, never a dollar (FR36)", () => {
    const csv = solarMetersCsv(statementlessSolarFarm());
    const marker = en.solar.table.allocationNotOnFile;
    // The honest-blank marker is present (the allocation cell and the map share both export it)...
    expect(csv).toContain(marker);
    // ...and no US-dollar figure appears anywhere in the export (a billed dollar is not part of the
    // solar table; a net-metering credit must never be). The "$" sigil is the simplest proof no dollar
    // leaked into a cell that should read honest-blank.
    expect(csv).not.toContain("$");
  });
});

// --------------------------------------------------------------------------------------------------
// (AC2) The discriminator: the allowed honest BILLING dollars are NOT flagged (F2 passes).
// --------------------------------------------------------------------------------------------------

function miniPlan(schedule: string, family: string, sizeClass: "small" | "large"): RatePlan {
  return {
    schedule,
    family,
    sizeClass,
    legacy: false,
    agricultural: true,
    customerChargePerMonth: 30,
    summer: { energy: { peak: 0.3, partial_peak: 0.2, off_peak: 0.1 }, demand: {} },
    winter: { energy: { peak: 0.3, partial_peak: 0.2, off_peak: 0.1 }, demand: {} },
  };
}

const MINI_CARD: RateCard = {
  utility: "PG&E",
  effectiveDate: "2026-03-01",
  source: "test",
  summerMonths: [5, 6, 7, 8, 9, 10],
  sizeBreakKw: 35,
  plans: [miniPlan("AG-C2", "AG-C", "large"), miniPlan("AG-C1", "AG-C", "small")],
};

describe("release gate discriminator: the F2 demand dollar is a BILLING dollar and passes (AC2)", () => {
  it("nemDemandInsight returns a demand-owed dollar sourced from BILLED line items, with NO statement on file", () => {
    // A reconciled AG-C NEM solar meter that OWES a demand charge (billed line items) and has printed
    // NEM months (so its position is honest), but NO true-up statement amount settled. The demand
    // dollar is allowed - it is money owed on the bill, not a net-metering credit.
    const insight = nemDemandInsight({
      isSolar: true,
      scheduleLabel: "AGC Ag35+ kW High Use",
      coverageState: "reconciled",
      nemMonths: [
        { start: "2026-01-01", netKwh: 10, amountCents: 200 },
        { start: "2026-02-01", netKwh: -8, amountCents: -150 },
      ],
      cycleDemandCents: [250, 119],
      // The release-gate scenario: no settled true-up amount on file.
      trueUpAmountCents: null,
      card: MINI_CARD,
    });
    expect(insight).not.toBeNull();
    // The demand-owed dollar is a BILLING line-item sum (250 + 119), not a NEM credit - it is allowed.
    expect(insight?.demandOwedCents).toBe(369);
    // The discriminator holds even here: the net-metering true-up amount is STILL honest-blank (null).
    expect(insight?.trueUpAmountCents).toBeNull();
  });

  it("the F2 demand dollar rides impactNote (a billing note), never impactUsd, so it never inflates the at-risk sum", () => {
    // The F2 emitter (run-solar-insight.ts) puts the demand dollar in `impactNote` and leaves
    // `impactUsd` absent: the demand charge is money OWED, not money at stake. The copy that carries it
    // is a billing note, distinct from any net-metering credit copy. We assert the note formats a
    // billing dollar (a "$..." string) and that it reads as a demand charge, not a solar credit.
    const note = en.solar.insight.note("$369");
    expect(note).toContain("$369");
    expect(note.toLowerCase()).toContain("demand charge");
    // A demand-charge note must never claim a net-metering credit ("saved" / "credit").
    expect(note.toLowerCase()).not.toContain("credit");
    expect(note.toLowerCase()).not.toContain("saved");
  });
});

// --------------------------------------------------------------------------------------------------
// (AC3) The structural assertion (FR10): no code path multiplies a percentage by a credit dollar.
// --------------------------------------------------------------------------------------------------

describe("release gate structural assertion: no percent-times-dollar credit (FR10)", () => {
  it("allocateArray returns SHARES (ratios in [0,1]) only, never a credit dollar", () => {
    const result = allocateArray("West", "West", [
      { pumpId: "p1", meterName: "p1", cumulativeKwh: 7500 },
      { pumpId: "p2", meterName: "p2", cumulativeKwh: 2500 },
    ]);
    // Every emitted figure is a SHARE in [0,1]; the result shape carries no credit-cents field.
    for (const s of result.shares) {
      expect(s.share).not.toBeNull();
      expect(s.share as number).toBeGreaterThanOrEqual(0);
      expect(s.share as number).toBeLessThanOrEqual(1);
    }
    expect(result.shares[0]?.share).toBeCloseTo(0.75, 10);
    expect(result.shares[1]?.share).toBeCloseTo(0.25, 10);
    // Structural: the allocation result has no credit-dollar field to multiply the share into.
    expect(findCreditDollarFields(result)).toEqual([]);
  });

  it("the dataset's per-array shares never produce a credit: a share times any dollar is never carried", () => {
    // The wedge's guarantee by construction: the dataset returns the SHARE alone, and there is no
    // credit-cents field anywhere on the array group for a render path to multiply it by. So even a
    // buggy consumer cannot read a `creditCents` off the shape, because the field does not exist.
    const ds = buildSolarDataset(statementlessSolarFarm(), NOW_MONTH);
    const group = ds.arrays[0];
    if (group === undefined) throw new Error("expected the West array group");
    for (const row of group.meters) {
      // Each row carries a share (a ratio) and the meter's own structure - and NOTHING dollar-shaped.
      const keys = Object.keys(row);
      const dollarKeys = keys.filter((k) => {
        const lower = k.toLowerCase();
        if (lower.includes("share") || lower.includes("pct")) return false; // ratios, allowed
        return CREDIT_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
      });
      expect(dollarKeys).toEqual([]);
    }
  });
});
