import { describe, expect, it } from "vitest";
import type { FindingView } from "@/lib/dashboard/findings";
import type { MeterView } from "@/lib/dashboard/load";
import type { MeterSolarContext } from "@/lib/almond/shape";
import {
  composeReportSnapshot,
  extractOpportunities,
  formatCentsUsd,
  projectMeter,
  projectFindings,
  rollupEntities,
  type ComprehensiveSnapshotMeter,
  type OpportunitySource,
} from "./snapshot";

// Pure, offline (zero DB): the snapshot's COMPOSITION logic — the rate-switch narrowing, the
// float-dollars -> integer-cents conversion, the descending sort, the rank/display, and the totals.
// The synthetic fixtures mirror the real Batth GROUND-TRUTH shape (.night/GROUND-TRUTH.md), so the
// $61,417.76 top opportunity and the four rate-switch opportunities are exercised here; the assertion
// against the LIVE Batth seed belongs to the preview check (it needs the full seed + engine run).

/** A FindingView with sane defaults; override only what the case needs. */
function finding(over: Partial<FindingView>): FindingView {
  return {
    id: "f",
    tool: "rate-optimization",
    situation: "This meter looks mis-rated",
    actionLabel: "Move it to AG-C",
    actionKind: "switch_rate",
    impactUsd: null,
    impactNote: null,
    severity: "act",
    status: "pending",
    meterId: null,
    meterName: null,
    rateSwitchTo: null,
    resultNote: null,
    ...over,
  };
}

/** A comprehensive per-meter record from a few core scalars (the rest honest "not on file"). */
function comprehensive(
  over: Pick<ComprehensiveSnapshotMeter, "id" | "name" | "rateSchedule"> &
    Partial<ComprehensiveSnapshotMeter>,
): ComprehensiveSnapshotMeter {
  return {
    serviceId: null,
    accountNumber: null,
    entityName: null,
    entityBillingName: null,
    ranchName: null,
    cropName: null,
    blocks: [],
    isLegacy: false,
    serialCode: null,
    status: null,
    powerSource: "electric",
    gpm: null,
    latitude: null,
    longitude: null,
    coverageState: "reconciled",
    costSource: "BILLED",
    modeledMonthlyCents: null,
    latestBilledCents: null,
    latestDemandCents: null,
    latestPeakKw: null,
    latestCycleClose: null,
    recentBills: [],
    solar: {
      isSolar: false,
      nemType: null,
      solarKw: null,
      trueUpMonth: null,
      trueUpAmountCents: null,
      trueUpDate: null,
      benefitingArrays: [],
      nemPeriods: [],
      sharePct: null,
      demandOwedCents: null,
      uncoveredShare: null,
      grandfather: { state: "unknown" },
    },
    ...over,
  };
}

// The four real Batth rate-switch opportunities (.night/GROUND-TRUTH.md), descending by savings.
const METERS = [
  { id: "m1", name: "Westside Pump 17", rateSchedule: "AG-B" },
  { id: "m2", name: "Lateral 3 Booster", rateSchedule: "AG-C" },
  { id: "m3", name: "Old Vineyard Well", rateSchedule: "AG-A1" },
  { id: "m4", name: "Dairy Field Pump 4", rateSchedule: "AG-A1" },
];

const FINDINGS: FindingView[] = [
  finding({ id: "f1", meterId: "m1", rateSwitchTo: "AG-C", impactUsd: 61417.76 }),
  finding({ id: "f2", meterId: "m2", rateSwitchTo: "AG-B", impactUsd: 6825.88 }),
  finding({ id: "f3", meterId: "m3", rateSwitchTo: "AG-B", impactUsd: 1214.45 }),
  finding({ id: "f4", meterId: "m4", rateSwitchTo: "AG-B", impactUsd: 993.03 }),
  // A demand-charge finding: a dollar finding, but NOT a rate switch (no rateSwitchTo) -> excluded.
  finding({ id: "f5", tool: "demand-charge", meterId: "m1", rateSwitchTo: null, impactUsd: 2031.12 }),
  // A switch finding whose meter is not in the loaded set -> excluded (never invents a meter).
  finding({ id: "f6", meterId: "ghost", rateSwitchTo: "AG-B", impactUsd: 9999.99 }),
];

describe("extractOpportunities", () => {
  it("keeps only switch_rate findings with an in-scope meter, converting impactUsd to whole cents", () => {
    const opps = extractOpportunities(METERS, FINDINGS);
    expect(opps.map((o) => o.meterName)).toEqual([
      "Westside Pump 17",
      "Lateral 3 Booster",
      "Old Vineyard Well",
      "Dairy Field Pump 4",
    ]);
    // Float dollars -> integer cents, no drift.
    expect(opps[0]).toEqual({
      meterName: "Westside Pump 17",
      fromRate: "AG-B",
      toRate: "AG-C",
      savingsCents: 6_141_776,
    });
    // The demand-charge (no rateSwitchTo) and the ghost-meter finding are both excluded.
    expect(opps).toHaveLength(4);
    expect(opps.some((o) => o.savingsCents === 999_999)).toBe(false);
  });
});

describe("composeReportSnapshot", () => {
  const snapshot = composeReportSnapshot({
    farm: { id: "farm1", name: "Batth Farms" },
    meterCount: 183,
    coverageAsOf: "2026-05-31",
    latestMonthSpendCents: 1_732_700,
    opportunities: extractOpportunities(METERS, FINDINGS),
  });

  it("ranks opportunities by savings descending with the top one first", () => {
    expect(snapshot.opportunities[0]).toEqual({
      rank: 1,
      meterName: "Westside Pump 17",
      fromRate: "AG-B",
      toRate: "AG-C",
      savingsCents: 6_141_776,
      savingsDisplay: "$61,417.76",
      kind: "rate_switch",
    });
    expect(snapshot.opportunities.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
    const savings = snapshot.opportunities.map((o) => o.savingsCents);
    expect(savings).toEqual([...savings].sort((a, b) => b - a));
  });

  it("sums the shown opportunities into the rate-switch total (so the manifest can verify it)", () => {
    // 6_141_776 + 682_588 + 121_445 + 99_303
    expect(snapshot.totals.rateSwitchSavingsCents).toBe(7_045_112);
  });

  it("passes through farm, meterCount, coverage and spend faithfully", () => {
    expect(snapshot.farm).toEqual({ id: "farm1", name: "Batth Farms" });
    expect(snapshot.meterCount).toBe(183);
    expect(snapshot.coverageAsOf).toBe("2026-05-31");
    expect(snapshot.totals.latestMonthSpendCents).toBe(1_732_700);
  });

  it("caps the report at the top 5 opportunities", () => {
    const many: OpportunitySource[] = Array.from({ length: 8 }, (_, i) => ({
      meterName: `Pump ${i}`,
      fromRate: "AG-A1",
      toRate: "AG-B",
      savingsCents: (i + 1) * 100_000,
    }));
    const capped = composeReportSnapshot({
      farm: { id: "f", name: "F" },
      meterCount: 8,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: many,
    });
    expect(capped.opportunities).toHaveLength(5);
    // The five largest, descending (savings 800k, 700k, ... 400k).
    expect(capped.opportunities.map((o) => o.savingsCents)).toEqual([
      800_000, 700_000, 600_000, 500_000, 400_000,
    ]);
  });
});

describe("composeReportSnapshot (comprehensive per-meter projection + rollups)", () => {
  it("carries the per-meter records + coverage counts + entity/fleet rollups, and defaults them for the PDF path", () => {
    const withMeters = composeReportSnapshot({
      farm: { id: "farm1", name: "Batth Farms" },
      meterCount: 2,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: [],
      meters: [
        comprehensive({ id: "m1", name: "Westside Pump 17", rateSchedule: "AG-B", entityName: "Batth Bros LLC", powerSource: "electric", latestBilledCents: 1_172_733 }),
        comprehensive({ id: "m2", name: "Lateral 3 Booster", rateSchedule: "AG-C", entityName: "Batth Bros LLC", powerSource: "diesel", costSource: "NONE" }),
      ],
      coverage: { reconciled: 1, needsReview: 1, noBill: 0 },
    });
    expect(withMeters.meters).toHaveLength(2);
    expect(withMeters.meters[0]?.name).toBe("Westside Pump 17");
    expect(withMeters.meters[0]?.latestBilledCents).toBe(1_172_733);
    expect(withMeters.totals.reconciledCount).toBe(1);
    expect(withMeters.totals.needsReviewCount).toBe(1);
    // Entities rolled up from the projected meters (one legal entity, two meters).
    expect(withMeters.entities).toEqual([{ name: "Batth Bros LLC", billingName: null, meterCount: 2 }]);
    // Fleet rollup counts power source from the meters (default when no fleetSummary arg given).
    expect(withMeters.fleetSummary.bySource).toEqual({ electric: 1, diesel: 1 });
    expect(withMeters.fleetSummary.meterCount).toBe(2);

    // The PDF path omits the new args -> empty projection + zero counts + empty rollups (back-compat).
    const pdfShape = composeReportSnapshot({
      farm: { id: "f", name: "F" },
      meterCount: 0,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: [],
    });
    expect(pdfShape.meters).toEqual([]);
    expect(pdfShape.totals.reconciledCount).toBe(0);
    expect(pdfShape.entities).toEqual([]);
    expect(pdfShape.findings).toEqual([]);
    expect(pdfShape.fleetSummary.bySource).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// projectMeter: from a full MeterView fixture with varied entity / ranch / costSource / solar, the
// COMPREHENSIVE record must populate (everything the chat can answer is in the sheet, null = not on file).
// ---------------------------------------------------------------------------

/** A full MeterView with sane defaults; override only what the case needs. */
function meterView(over: Partial<MeterView>): MeterView {
  return {
    id: "mv",
    name: "Pump",
    serviceId: null,
    rateSchedule: null,
    serialCode: null,
    isLegacy: false,
    status: null,
    powerSource: "electric",
    coverageState: "no_bill",
    costSource: "NONE",
    modeledMonthlyCents: null,
    accountNumber: null,
    ranchName: null,
    entityName: null,
    entityBillingName: null,
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
    nemPeriods: [],
    blocks: [],
    growerPumpId: null,
    periods: [],
    ...over,
  };
}

describe("projectMeter (comprehensive per-meter record from a full MeterView)", () => {
  it("projects a BILLED meter's entity, billing name, ranch, blocks, and coverage-gated billed money", () => {
    const m = projectMeter(
      meterView({
        id: "m1",
        name: "Westside Pump 17",
        serviceId: "91898735",
        rateSchedule: "AG-B",
        isLegacy: false,
        status: "GOOD",
        powerSource: "electric",
        coverageState: "reconciled",
        costSource: "BILLED",
        accountNumber: "1234567890",
        entityName: "Batth Bros LLC",
        entityBillingName: "BATTH BROTHERS",
        ranchName: "Home Ranch",
        cropName: "Almonds",
        gpm: 1200,
        blocks: [{ id: "b1", name: "North Block", acreage: 42 }],
        periods: [
          {
            start: "2026-05-01T00:00:00.000Z",
            close: "2026-05-31T00:00:00.000Z",
            printedTotalCents: 1_172_733,
            demandCents: 278_322,
            totalKwh: 50_000,
            peakKw: 140,
            tariff: "AG-B",
            lineItems: [
              { kind: "tou_energy", label: "Energy", amountCents: 800_000, quantity: 50_000, unit: "kWh", rate: 0.16 },
              { kind: "nbc", label: "NBC", amountCents: 90_000, quantity: null, unit: null, rate: null },
              { kind: "demand", label: "Demand", amountCents: 278_322, quantity: 140, unit: "kW", rate: null },
            ],
          },
        ],
      }),
      undefined,
    );
    expect(m.entityName).toBe("Batth Bros LLC");
    expect(m.entityBillingName).toBe("BATTH BROTHERS");
    expect(m.ranchName).toBe("Home Ranch");
    expect(m.blocks).toEqual([{ name: "North Block", acreage: 42 }]);
    expect(m.costSource).toBe("BILLED");
    expect(m.latestBilledCents).toBe(1_172_733); // coverage-gated: BILLED -> the printed total
    expect(m.latestDemandCents).toBe(278_322);
    expect(m.latestPeakKw).toBe(140);
    expect(m.latestCycleClose).toBe("2026-05-31T00:00:00.000Z");
    expect(m.recentBills).toHaveLength(1);
    // The energy / NBC split is summed from the cycle's line items.
    expect(m.recentBills[0]?.energyCents).toBe(800_000);
    expect(m.recentBills[0]?.nbcCents).toBe(90_000);
    expect(m.solar.isSolar).toBe(false);
  });

  it("gates an UNRECONCILED (MODELED) meter's billed money to null, but carries the modeled estimate", () => {
    const m = projectMeter(
      meterView({
        id: "m2",
        name: "Lateral Booster",
        rateSchedule: "AG-C",
        coverageState: "no_bill",
        costSource: "MODELED",
        modeledMonthlyCents: 312_050,
        // A metered period with a usage close but NO printed total (not a posted bill).
        periods: [
          { start: "2026-05-01T00:00:00.000Z", close: "2026-05-31T00:00:00.000Z", printedTotalCents: null, demandCents: null, totalKwh: 9_000, peakKw: 40, tariff: "AG-C", lineItems: [] },
        ],
      }),
      undefined,
    );
    expect(m.costSource).toBe("MODELED");
    expect(m.latestBilledCents).toBeNull(); // never a fabricated 0 for an unreconciled meter
    expect(m.modeledMonthlyCents).toBe(312_050);
  });

  it("leaves entity / ranch / blocks honest-null when not on file (a NONE meter)", () => {
    const m = projectMeter(meterView({ id: "m3", name: "Mystery Pump", costSource: "NONE" }), undefined);
    expect(m.entityName).toBeNull();
    expect(m.ranchName).toBeNull();
    expect(m.blocks).toEqual([]);
    expect(m.costSource).toBe("NONE");
    expect(m.latestBilledCents).toBeNull();
  });

  it("carries a solar meter's program, arrays, share and demand-owed from its solar context", () => {
    const ctx: MeterSolarContext = {
      sharePct: 0.42,
      demandOwedCents: 50_000,
      uncoveredShare: 0.3,
      grandfather: { state: "known", expiryYear: 2040, yearsRemaining: 14 },
    };
    const m = projectMeter(
      meterView({
        id: "m4",
        name: "Solar Pump",
        isSolar: true,
        nemType: "nem2",
        solarKw: 840,
        trueUpMonth: 4,
        trueUpAmountCents: -120_000,
        trueUpDate: "2026-04-15T00:00:00.000Z",
        benefitingArrays: [
          { id: "a1", name: "Array A", nameplateKw: 840, nemType: "nem2", trueUpMonth: 4, interconnectionDate: "2020-04-15T00:00:00.000Z" },
        ],
        nemPeriods: [
          { start: "2026-03-01T00:00:00.000Z", close: "2026-03-31T00:00:00.000Z", netKwh: -1200, amountCents: -30_000 },
        ],
      }),
      ctx,
    );
    expect(m.solar.isSolar).toBe(true);
    expect(m.solar.nemType).toBe("nem2");
    expect(m.solar.solarKw).toBe(840);
    expect(m.solar.sharePct).toBe(0.42);
    expect(m.solar.demandOwedCents).toBe(50_000);
    expect(m.solar.uncoveredShare).toBe(0.3);
    expect(m.solar.grandfather).toEqual({ state: "known", expiryYear: 2040, yearsRemaining: 14 });
    expect(m.solar.benefitingArrays).toHaveLength(1);
    expect(m.solar.benefitingArrays[0]?.nameplateKw).toBe(840);
    expect(m.solar.nemPeriods).toHaveLength(1);
  });
});

describe("rollupEntities + projectFindings", () => {
  it("rolls up distinct entities (billing name carried, most meters first)", () => {
    const meters: ComprehensiveSnapshotMeter[] = [
      comprehensive({ id: "m1", name: "P1", rateSchedule: "AG-B", entityName: "Alpha", entityBillingName: "ALPHA INC" }),
      comprehensive({ id: "m2", name: "P2", rateSchedule: "AG-B", entityName: "Alpha", entityBillingName: "ALPHA INC" }),
      comprehensive({ id: "m3", name: "P3", rateSchedule: "AG-C", entityName: "Beta", entityBillingName: null }),
      comprehensive({ id: "m4", name: "P4", rateSchedule: "AG-C", entityName: null }), // no entity -> not a row
    ];
    expect(rollupEntities(meters)).toEqual([
      { name: "Alpha", billingName: "ALPHA INC", meterCount: 2 },
      { name: "Beta", billingName: null, meterCount: 1 },
    ]);
  });

  it("projects ALL pending findings (not just rate switches), carrying severity + null impacts", () => {
    const projected = projectFindings([
      finding({ id: "f1", situation: "Mis-rated", actionLabel: "Move it to AG-C", actionKind: "switch_rate", impactUsd: 61417.76, severity: "act", meterName: "Westside Pump 17" }),
      // A demand-charge finding carries its one honest dollar in impactNote (no impactUsd) - the chat
      // states it, so the snapshot must too (parity).
      finding({ id: "f2", situation: "Demand spike", actionLabel: "Review demand", actionKind: "review_demand", impactUsd: null, impactNote: "About $2,031 in demand charges this cycle", severity: "watch", meterName: null }),
    ]);
    expect(projected).toHaveLength(2);
    expect(projected[0]).toEqual({
      situation: "Mis-rated",
      actionLabel: "Move it to AG-C",
      actionKind: "switch_rate",
      impactUsd: 61417.76,
      impactNote: null,
      severity: "act",
      meterName: "Westside Pump 17",
    });
    expect(projected[1]?.impactUsd).toBeNull();
    // The demand-charge dollar story is carried verbatim (the parity fix).
    expect(projected[1]?.impactNote).toBe("About $2,031 in demand charges this cycle");
  });
});

describe("formatCentsUsd", () => {
  it("renders cent precision with thousands separators", () => {
    expect(formatCentsUsd(6_141_776)).toBe("$61,417.76");
    expect(formatCentsUsd(99_303)).toBe("$993.03");
    expect(formatCentsUsd(5)).toBe("$0.05");
    expect(formatCentsUsd(0)).toBe("$0.00");
    expect(formatCentsUsd(100_000_000)).toBe("$1,000,000.00");
  });
});
