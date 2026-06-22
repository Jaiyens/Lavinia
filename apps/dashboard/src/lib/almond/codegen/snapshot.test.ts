import { describe, expect, it } from "vitest";
import type { FindingView } from "@/lib/dashboard/findings";
import {
  composeReportSnapshot,
  extractOpportunities,
  formatCentsUsd,
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

describe("composeReportSnapshot (Phase 3: workbook projection)", () => {
  it("carries the per-meter projection + coverage counts, and defaults them empty for the PDF path", () => {
    const withMeters = composeReportSnapshot({
      farm: { id: "farm1", name: "Batth Farms" },
      meterCount: 2,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: [],
      meters: [
        { id: "m1", name: "Westside Pump 17", rate: "AG-B", costCents: 1_172_733, demandCents: 278_322 },
        { id: "m2", name: "Lateral 3 Booster", rate: "AG-C", costCents: null, demandCents: null },
      ],
      coverage: { reconciled: 1, needsReview: 1, noBill: 0 },
    });
    expect(withMeters.meters).toHaveLength(2);
    expect(withMeters.meters[0]).toEqual({
      id: "m1",
      name: "Westside Pump 17",
      rate: "AG-B",
      costCents: 1_172_733,
      demandCents: 278_322,
    });
    expect(withMeters.totals.reconciledCount).toBe(1);
    expect(withMeters.totals.needsReviewCount).toBe(1);
    expect(withMeters.totals.noBillCount).toBe(0);

    // The PDF path omits the new args -> empty projection + zero counts (back-compat, additive).
    const pdfShape = composeReportSnapshot({
      farm: { id: "f", name: "F" },
      meterCount: 0,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: [],
    });
    expect(pdfShape.meters).toEqual([]);
    expect(pdfShape.totals.reconciledCount).toBe(0);
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
