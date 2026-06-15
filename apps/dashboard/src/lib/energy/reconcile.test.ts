import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PerSaChargeDetailSchema } from "@/lib/extract/schema";
import { normalizeBill } from "@/lib/normalize/billing";
import type { CanonicalBillingPeriod, CanonicalLineItem } from "@/lib/normalize/types";
import type { CoverageState, Recommendation, RecStatus } from "@/lib/recommendations";
import {
  deriveAccountCoverage,
  deriveMeterCoverage,
  reconcile,
  reconcileBill,
  reconcilePeriod,
  reconcilesToCents,
  sumLineItemCents,
  type ReconcileInput,
} from "./reconcile";

// A persisted hold we emitted earlier in the cycle, with the farmer's status.
function hold(id: string, impactUsd: number, status: RecStatus): Recommendation {
  return {
    id,
    farmId: "farm1",
    tool: "pump-timing",
    situation: `hold ${id}`,
    action: { kind: "stagger_pumps", label: `do ${id}` },
    impactUsd,
    severity: "act",
    status,
    createdAt: "2026-06-01",
  };
}

const HOLDS: Recommendation[] = [
  hold("h1", 800, "done"), // followed
  hold("h2", 600, "done"), // followed
  hold("h3", 400, "overridden"), // not followed (ran anyway)
  hold("h4", 200, "pending"), // never acted on
];

const INPUT: ReconcileInput = {
  farmId: "farm1",
  cycleLabel: "June",
  holds: HOLDS,
  actualDemandChargeUsd: 3600,
  baselineDemandChargeUsd: 5000,
  asOf: "2026-07-16",
};

describe("reconcile", () => {
  it("counts followed-vs-not and totals the dollars", () => {
    const out = reconcile(INPUT);
    expect(out.followedCount).toBe(2);
    expect(out.totalCount).toBe(4);
    expect(out.predictedAvoidableUsd).toBe(2000); // 800+600+400+200
    expect(out.missedUsd).toBe(600); // 400 + 200 not followed
    // With a baseline, realized savings come from the real bill delta.
    expect(out.realizedAvoidedUsd).toBe(1400); // 5000 - 3600
    expect(out.actualDemandChargeUsd).toBe(3600);
  });

  it("builds the loop-closing digest in the farmer's words", () => {
    const { summary } = reconcile(INPUT);
    expect(summary.tool).toBe("pump-timing");
    expect(summary.severity).toBe("info");
    expect(summary.impactUsd).toBe(1400);
    expect(summary.createdAt).toBe("2026-07-16");
    expect(summary.resolvedAt).toBe("2026-07-16");
    expect(summary.situation).toBe(
      "Your June bill posted, so here is how it closed out.",
    );
    expect(summary.impactNote).toBe(
      "You followed 2 of 4 holds. Your demand charge was $3,600, and you avoided about $1,400.",
    );
    expect(summary.action.kind).toBe("review_result");
    expect(summary.result).toEqual({
      followed: false, // not all four were followed
      predictedUsd: 2000,
      actualUsd: 3600,
      avoidedUsd: 1400,
      note: "You followed 2 of 4 holds. Your demand charge was $3,600, and you avoided about $1,400.",
    });
    expect(summary.action.params).toEqual({
      cycleLabel: "June",
      followedCount: 2,
      totalCount: 4,
      predictedAvoidableUsd: 2000,
      realizedAvoidedUsd: 1400,
      missedUsd: 600,
      actualDemandChargeUsd: 3600,
    });
  });

  it("resolves each hold with its result and a resolved-at stamp", () => {
    const { resolved } = reconcile(INPUT);
    expect(resolved).toHaveLength(4);

    const followed = resolved[0];
    const overridden = resolved[2];
    if (!followed || !overridden) throw new Error("expected resolved holds");

    expect(followed.resolvedAt).toBe("2026-07-16");
    expect(followed.result).toEqual({
      followed: true,
      predictedUsd: 800,
      avoidedUsd: 800,
      note: "Hold followed.",
    });
    expect(overridden.result).toEqual({
      followed: false,
      predictedUsd: 400,
      avoidedUsd: 0,
      note: "Hold not followed; this saving was left on the table.",
    });
    // The farmer's own status is never overwritten by reconciliation.
    expect(overridden.status).toBe("overridden");
  });

  it("falls back to followed predictions when no baseline is given", () => {
    const out = reconcile({ ...INPUT, baselineDemandChargeUsd: undefined });
    expect(out.realizedAvoidedUsd).toBe(1400); // 800 + 600 followed predictions
  });

  it("reports a clean slate when there were no holds", () => {
    const out = reconcile({ ...INPUT, holds: [], baselineDemandChargeUsd: 3600 });
    expect(out.totalCount).toBe(0);
    expect(out.followedCount).toBe(0);
    expect(out.realizedAvoidedUsd).toBe(0);
    expect(out.summary.result?.followed).toBe(false);
    expect(out.resolved).toEqual([]);
  });
});

// --- Bill cent-reconciliation gate + honest coverage state (Story 1.7) ----------------

function lineItem(amountCents: number): CanonicalLineItem {
  return { kind: "other", label: null, amountCents, quantity: null, unit: null, rate: null };
}

function period(
  printedTotalCents: number,
  lineItemCents: number[],
  coverageState: CoverageState = "no_bill",
): CanonicalBillingPeriod {
  return {
    saId: "1007066742",
    start: "2026-02-01",
    close: "2026-02-28",
    cycleClose: "2026-02-28",
    tariff: "AG-C",
    isLegacyTou: false,
    touSplit: [],
    demandKw: null,
    demandAmountCents: null,
    lineItems: lineItemCents.map(lineItem),
    printedTotalCents,
    coverageState,
  };
}

describe("reconcilesToCents, the integer-cent gate (AC1/AC3)", () => {
  it("passes on an exact match and at the one-cent boundary", () => {
    expect(reconcilesToCents(245657, 245657)).toBe(true);
    expect(reconcilesToCents(245658, 245657)).toBe(true); // +1 cent
    expect(reconcilesToCents(245656, 245657)).toBe(true); // -1 cent
  });
  it("fails beyond one cent", () => {
    expect(reconcilesToCents(245659, 245657)).toBe(false); // +2 cents
    expect(reconcilesToCents(245655, 245657)).toBe(false); // -2 cents
  });
});

describe("reconcilePeriod, one period's honest state (AC1/AC3/AC4)", () => {
  it("reconciles when line items sum to the printed total", () => {
    expect(sumLineItemCents(period(245657, [149847, 88100, 4210, 3500]))).toBe(245657);
    expect(reconcilePeriod(period(245657, [149847, 88100, 4210, 3500]))).toBe("reconciled");
  });
  it("reconciles at the one-cent boundary", () => {
    expect(reconcilePeriod(period(100, [99]))).toBe("reconciled");
  });
  it("needs_review when an OCR/dropped line breaks the sum (AC3)", () => {
    // A garbled/dropped line item: the parts no longer add to the printed total.
    expect(reconcilePeriod(period(245657, [149847, 88100, 4210]))).toBe("needs_review");
  });
  it("never promotes an upstream identity-join failure, even with a perfect sum (AC4)", () => {
    // Story 1.6 marked this needs_review (wrong-meter risk); a perfect cent sum cannot save it.
    expect(reconcilePeriod(period(100, [100], "needs_review"))).toBe("needs_review");
  });
  it("never vacuously reconciles a period with no captured line items (AC1/AC3)", () => {
    // An extraction that captured nothing must not read as reconciled even at a ~0 total.
    expect(reconcilePeriod(period(0, []))).toBe("needs_review");
    expect(reconcilePeriod(period(1, []))).toBe("needs_review");
    expect(reconcilePeriod(period(245657, []))).toBe("needs_review");
  });
  it("reconciles a net-credit (negative-total) bill when the negatives sum correctly", () => {
    // NEM/credit bills carry negative cents; the abs gate handles the sign symmetrically.
    expect(reconcilePeriod(period(-5000, [-3000, -2000]))).toBe("reconciled");
  });
});

describe("deriveMeterCoverage, one state per meter (AC4)", () => {
  it("is no_bill for a meter with no bill (the inventory still renders)", () => {
    expect(deriveMeterCoverage(null)).toBe("no_bill");
    expect(deriveMeterCoverage({ saId: "x", saIdDescriptor: null, meterNumber: null, growerPumpId: null, periods: [] })).toBe("no_bill");
  });
  it("is reconciled only when every period reconciles", () => {
    const allGood = {
      saId: "1007066742", saIdDescriptor: null, meterNumber: "M-8841", growerPumpId: "P001",
      periods: [period(100, [100]), period(200, [120, 80])],
    };
    expect(deriveMeterCoverage(allGood)).toBe("reconciled");
  });
  it("is needs_review when any period is unreconciled", () => {
    const oneBroken = {
      saId: "1007066742", saIdDescriptor: null, meterNumber: "M-8841", growerPumpId: "P001",
      periods: [period(100, [100]), period(200, [120])], // second is short
    };
    expect(deriveMeterCoverage(oneBroken)).toBe("needs_review");
  });
});

describe("deriveAccountCoverage, account reconciles to the account total, not a partial subtotal (AC2)", () => {
  it("is no_bill with no members", () => {
    expect(deriveAccountCoverage([], [], 1000)).toBe("no_bill");
  });
  it("reconciles when all members reconcile and the SA totals sum to the account total", () => {
    expect(deriveAccountCoverage(["reconciled", "reconciled"], [60000, 40000], 100000)).toBe("reconciled");
    expect(deriveAccountCoverage(["reconciled", "reconciled"], [60000, 40001], 100000)).toBe("reconciled"); // +1c
  });
  it("needs_review when any member is unreconciled (a partial subtotal can't reconcile the account)", () => {
    expect(deriveAccountCoverage(["reconciled", "needs_review"], [60000, 40000], 100000)).toBe("needs_review");
  });
  it("needs_review when the SA totals miss the account total by more than a cent", () => {
    expect(deriveAccountCoverage(["reconciled"], [99998], 100000)).toBe("needs_review");
  });
  it("needs_review when the account printed total is unknown", () => {
    expect(deriveAccountCoverage(["reconciled"], [100000], null)).toBe("needs_review");
  });
  it("needs_review when member states and SA totals do not correspond 1:1 (no partial subtotal)", () => {
    // 3 reconciled members but only 2 SA totals supplied -> a dropped total; never certify.
    expect(deriveAccountCoverage(["reconciled", "reconciled", "reconciled"], [60000, 40000], 100000)).toBe(
      "needs_review",
    );
  });
});

describe("reconcileBill 1.6 -> 1.7 handoff (integration)", () => {
  it("promotes a clean normalizeBill period (no_bill) to reconciled when the cents add up", () => {
    const raw = PerSaChargeDetailSchema.parse(
      JSON.parse(
        readFileSync(join(process.cwd(), "fixtures/extract/sample-charge-detail.json"), "utf8"),
      ),
    );
    const inventory = { meters: [{ saId: "1007066742", meterSerial: "M-8841", growerPumpId: "P001" }] };
    const bill = normalizeBill(raw, inventory);
    expect(bill.periods[0]!.coverageState).toBe("no_bill"); // 1.6 leaves it pending
    const reconciled = reconcileBill(bill);
    expect(reconciled.periods[0]!.coverageState).toBe("reconciled"); // 1.7 promotes it
    expect(deriveMeterCoverage(reconciled)).toBe("reconciled");
    // The input is not mutated (pure).
    expect(bill.periods[0]!.coverageState).toBe("no_bill");
  });
});
