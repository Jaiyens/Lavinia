import { describe, expect, it } from "vitest";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { centsFromDollars } from "@/lib/format/money";
import { analyzeFarm, type EnrichedMeter } from "./analysis";

// Pure unit test (the T1 gate). Builds an in-memory MeterView[] + FindingView[] fixture and
// asserts the enriched analysis agrees with the dashboard's findings (impactUsd -> cents via the
// shared centsFromDollars) and that no dollar field is ever a string.

// Spread (not `??`) so an explicit `null` override is honored for nullable fields.
function makeMeter(over: Partial<MeterView> = {}): MeterView {
  const base: MeterView = {
    id: "m1",
    name: "Pump 1",
    serviceId: "SA-1",
    rateSchedule: "AG-A1",
    serialCode: null,
    isLegacy: false,
    status: null,
    coverageState: "reconciled" as MeterView["coverageState"],
    accountNumber: "1001",
    ranchName: "North Ranch",
    entityName: "Batth LLC",
    cropName: "Almonds",
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
    nemPeriods: [],
    growerPumpId: null,
    periods: [],
  };
  return { ...base, ...over };
}

function period(
  over: Partial<MeterView["periods"][number]> = {},
): MeterView["periods"][number] {
  const base: MeterView["periods"][number] = {
    start: "2026-01-01",
    close: "2026-01-31",
    printedTotalCents: null,
    demandCents: null,
    peakKw: null,
    tariff: null,
    lineItems: [],
  };
  return { ...base, ...over };
}

function finding(over: Partial<FindingView> = {}): FindingView {
  return {
    id: over.id ?? "f1",
    tool: over.tool ?? "rate-optimization",
    situation: over.situation ?? "This meter looks mis-rated",
    actionLabel: "actionLabel" in over ? (over.actionLabel ?? null) : "Move it to AG-B",
    impactUsd: "impactUsd" in over ? (over.impactUsd ?? null) : 4_322,
    impactNote: "impactNote" in over ? (over.impactNote ?? null) : null,
    severity: over.severity ?? "act",
    status: over.status ?? "pending",
    meterId: "meterId" in over ? (over.meterId ?? null) : "m1",
    meterName: "meterName" in over ? (over.meterName ?? null) : null,
    rateSwitchTo: "rateSwitchTo" in over ? (over.rateSwitchTo ?? null) : "AG-B",
    rateSwitchFrom: "rateSwitchFrom" in over ? (over.rateSwitchFrom ?? null) : "AG-A1",
    resultNote: over.resultNote ?? null,
  };
}

// Entity A ("Batth LLC"): Westside Pump 17 (most expensive + biggest savings), Dairy Field Pump 4.
// Entity B ("Westside Holdings"): East Pump 9, Orchard Pump 2 (no finding).
const meters: MeterView[] = [
  makeMeter({
    id: "west17",
    name: "Westside Pump 17",
    entityName: "Batth LLC",
    ranchName: "Westside",
    rateSchedule: "AG-4",
    periods: [
      period({ start: "2026-02-01", close: "2026-02-28", printedTotalCents: 9_000_00, demandCents: 2_000_00 }),
      period({ start: "2026-03-01", close: "2026-03-31", printedTotalCents: 12_000_00, demandCents: 3_000_00 }),
    ],
  }),
  makeMeter({
    id: "dairy4",
    name: "Dairy Field Pump 4",
    entityName: "Batth LLC",
    ranchName: "Dairy",
    rateSchedule: "AG-5C",
    periods: [period({ start: "2026-03-01", close: "2026-03-31", printedTotalCents: 4_500_00, demandCents: 500_00 })],
  }),
  makeMeter({
    id: "east9",
    name: "East Pump 9",
    entityName: "Westside Holdings",
    ranchName: "East",
    rateSchedule: "AG-A1",
    periods: [period({ start: "2026-03-01", close: "2026-03-31", printedTotalCents: 2_200_00, demandCents: null })],
  }),
  makeMeter({
    id: "orchard2",
    name: "Orchard Pump 2",
    entityName: "Westside Holdings",
    ranchName: "Orchard",
    rateSchedule: "AG-A1",
    coverageState: "needs_review" as MeterView["coverageState"],
    periods: [period({ start: "2026-03-01", close: "2026-03-31", printedTotalCents: 1_000_00, demandCents: null })],
  }),
];

const findings: FindingView[] = [
  // Westside Pump 17: the biggest rate-switch savings.
  finding({ id: "f-west", meterId: "west17", impactUsd: 6_500, rateSwitchTo: "AG-B" }),
  // Dairy Field Pump 4: a smaller rate-switch savings.
  finding({ id: "f-dairy", meterId: "dairy4", impactUsd: 1_200, rateSwitchTo: "AG-C" }),
  // East Pump 9: a non-rate-switch ACT finding (e.g. a demand-charge spike) whose dollar impact
  // is the LARGEST of all - it is NOT an opportunity (no rate switch), but it IS the topFinding,
  // proving topFinding can differ from opportunities[0].
  finding({
    id: "f-east",
    meterId: "east9",
    tool: "demand-charge",
    impactUsd: 9_999,
    severity: "act",
    rateSwitchTo: null,
    rateSwitchFrom: null,
    actionLabel: "Shift pumping off peak",
  }),
  // A fleet-level finding (no meterId) must be ignored by the meter map.
  finding({ id: "f-fleet", meterId: null, impactUsd: 3_000, rateSwitchTo: "AG-B" }),
];

function allEnriched(): EnrichedMeter[] {
  const a = analyzeFarm(meters, findings);
  return [...a.meters, ...a.rankingsByCost, ...a.opportunities];
}

describe("analyzeFarm", () => {
  it("1. opportunities contains Westside Pump 17 and it is rankingsByCost[0]", () => {
    const a = analyzeFarm(meters, findings);
    expect(a.opportunities.map((m) => m.name)).toContain("Westside Pump 17");
    expect(a.rankingsByCost[0]?.name).toBe("Westside Pump 17");
  });

  it("2. opportunities is sorted desc by estAnnualSavingsCents; [0] is Westside Pump 17", () => {
    const a = analyzeFarm(meters, findings);
    expect(a.opportunities[0]?.name).toBe("Westside Pump 17");
    // Only the two rate-switch meters are opportunities; the null-switch East Pump is excluded.
    expect(a.opportunities.map((m) => m.name)).toEqual([
      "Westside Pump 17",
      "Dairy Field Pump 4",
    ]);
    const savings = a.opportunities.map((m) => m.flags.estAnnualSavingsCents);
    for (let i = 1; i < savings.length; i += 1) {
      expect(savings[i - 1]).toBeGreaterThanOrEqual(savings[i] ?? 0);
    }
    // The savings is centsFromDollars(impactUsd), agreeing with the dashboard's float dollars.
    expect(a.opportunities[0]?.flags.estAnnualSavingsCents).toBe(centsFromDollars(6_500));
    expect(a.opportunities[0]?.flags.suggestedRate).toBe("AG-B");
  });

  it("3. totals.spendCents equals the sum of per-meter thisCycleCents", () => {
    const a = analyzeFarm(meters, findings);
    const summed = a.meters.reduce((acc, m) => acc + (m.thisCycleCents ?? 0), 0);
    expect(a.totals.spendCents).toBe(summed);
    // Westside latest reconciled (March) + Dairy + East; the needs_review Orchard is withheld.
    expect(a.totals.spendCents).toBe(12_000_00 + 4_500_00 + 2_200_00);
    expect(a.totals.demandChargeCents).toBe(3_000_00 + 500_00);
  });

  it("4. totals.entityCount matches distinct entities and byEntity rollups sum to totals", () => {
    const a = analyzeFarm(meters, findings);
    expect(a.totals.entityCount).toBe(2);
    expect(a.totals.meterCount).toBe(meters.length);

    const entitySpend = a.byEntity.reduce((acc, e) => acc + e.spendCents, 0);
    const entityDemand = a.byEntity.reduce((acc, e) => acc + e.demandChargeCents, 0);
    const entityMeters = a.byEntity.reduce((acc, e) => acc + e.meterCount, 0);
    expect(entitySpend).toBe(a.totals.spendCents);
    expect(entityDemand).toBe(a.totals.demandChargeCents);
    expect(entityMeters).toBe(meters.length);

    const batth = a.byEntity.find((e) => e.entity === "Batth LLC");
    expect(batth?.meterCount).toBe(2);
    expect(batth?.spendCents).toBe(12_000_00 + 4_500_00);
  });

  it("5. no string dollars: every enriched dollar field is typeof number", () => {
    for (const m of allEnriched()) {
      if (m.thisCycleCents !== null) expect(typeof m.thisCycleCents).toBe("number");
      if (m.demandChargeCents !== null) expect(typeof m.demandChargeCents).toBe("number");
      expect(typeof m.flags.estAnnualSavingsCents).toBe("number");
    }
    const a = analyzeFarm(meters, findings);
    expect(typeof a.totals.spendCents).toBe("number");
    expect(typeof a.totals.demandChargeCents).toBe("number");
    for (const e of a.byEntity) {
      expect(typeof e.spendCents).toBe("number");
      expect(typeof e.demandChargeCents).toBe("number");
    }
  });

  it("6. a meter with no finding is not mis-rated and has zero savings", () => {
    const a = analyzeFarm(meters, findings);
    const orchard = a.meters.find((m) => m.id === "orchard2");
    expect(orchard?.flags.misRated).toBe(false);
    expect(orchard?.flags.suggestedRate).toBeNull();
    expect(orchard?.flags.estAnnualSavingsCents).toBe(0);
    // A finding with rateSwitchTo null is also not an opportunity.
    const east = a.meters.find((m) => m.id === "east9");
    expect(east?.flags.misRated).toBe(false);
    expect(east?.flags.estAnnualSavingsCents).toBe(0);
  });

  it("7. topFinding is the highest severity-then-dollar finding across ALL tools, and can differ from opportunities[0]", () => {
    const a = analyzeFarm(meters, findings);
    // East Pump 9's $9,999 demand-charge act finding outranks every rate switch, so it is the
    // topFinding - while opportunities[0] (the biggest RATE SWITCH) is Westside Pump 17.
    expect(a.topFinding?.meterName).toBe("East Pump 9");
    expect(a.topFinding?.tool).toBe("demand-charge");
    expect(a.topFinding?.impactCents).toBe(centsFromDollars(9_999));
    expect(a.topFinding?.suggestedRate).toBeNull(); // not a rate switch
    expect(a.opportunities[0]?.name).toBe("Westside Pump 17");
    expect(a.topFinding?.meterName).not.toBe(a.opportunities[0]?.name);
  });

  it("8. rankedFindings lists every dollar finding sorted by compareFindings, in integer cents", () => {
    const a = analyzeFarm(meters, findings);
    // All four fixture findings carry a dollar (incl. the fleet finding with no meter).
    expect(a.rankedFindings).toHaveLength(4);
    // Sorted severity-then-dollar: East ($9,999 act) > Westside ($6,500 act) > fleet ($3,000 act) > Dairy ($1,200 act).
    expect(a.rankedFindings.map((f) => f.impactCents)).toEqual([
      centsFromDollars(9_999),
      centsFromDollars(6_500),
      centsFromDollars(3_000),
      centsFromDollars(1_200),
    ]);
    expect(a.rankedFindings[0]?.meterName).toBe("East Pump 9");
    for (const f of a.rankedFindings) expect(typeof f.impactCents).toBe("number");
  });

  it("topFinding is null when there are no findings", () => {
    const a = analyzeFarm(meters, []);
    expect(a.topFinding).toBeNull();
    expect(a.rankedFindings).toEqual([]);
  });

  it("withholds spend from a non-reconciled meter (null, never zero-filled into a meter cell)", () => {
    const a = analyzeFarm(meters, findings);
    const orchard = a.meters.find((m) => m.id === "orchard2");
    expect(orchard?.thisCycleCents).toBeNull();
    expect(orchard?.demandChargeCents).toBeNull();
  });

  it("picks the highest-impact rate-switch finding when a meter has several", () => {
    const multi = [makeMeter({ id: "m1", name: "Pump 1" })];
    const multiFindings = [
      finding({ id: "a", meterId: "m1", impactUsd: 100, rateSwitchTo: "AG-A" }),
      finding({ id: "b", meterId: "m1", impactUsd: 900, rateSwitchTo: "AG-Z" }),
      finding({ id: "c", meterId: "m1", impactUsd: 500, rateSwitchTo: "AG-M" }),
    ];
    const a = analyzeFarm(multi, multiFindings);
    expect(a.meters[0]?.flags.suggestedRate).toBe("AG-Z");
    expect(a.meters[0]?.flags.estAnnualSavingsCents).toBe(centsFromDollars(900));
  });

  it("rankingsByCost sorts null thisCycleCents last with a deterministic name tie-break", () => {
    const tie = [
      makeMeter({ id: "b", name: "Bravo", periods: [period({ printedTotalCents: 500_00 })] }),
      makeMeter({ id: "a", name: "Alpha", periods: [period({ printedTotalCents: 500_00 })] }),
      makeMeter({ id: "z", name: "Zulu", coverageState: "no_bill" as MeterView["coverageState"] }),
    ];
    const a = analyzeFarm(tie, []);
    expect(a.rankingsByCost.map((m) => m.name)).toEqual(["Alpha", "Bravo", "Zulu"]);
  });
});
