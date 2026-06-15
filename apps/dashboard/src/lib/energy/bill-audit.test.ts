import { describe, expect, it } from "vitest";
import { billAudit, type BillAuditInput } from "./bill-audit";
import type { CycleBill } from "./types";

const SUMMER_MONTHS = [5, 6, 7, 8, 9, 10];

// A summer-month cycle: total + peak. Day 01 close 28, the seed's window shape.
function cycle(month1: number, totalBillUsd: number, peakKw: number): CycleBill {
  const mm = String(month1).padStart(2, "0");
  return {
    start: `2025-${mm}-01`,
    close: `2025-${mm}-28`,
    tariff: "AG-A",
    demandChargeUsd: null,
    peakKw,
    totalBillUsd,
  };
}

function input(bills: CycleBill[]): BillAuditInput {
  return {
    farmId: "farm1",
    pumpId: "pump1",
    pumpName: "Dairy Field Pump 4",
    bills,
    summerMonths: SUMMER_MONTHS,
    asOf: "2026-06-06",
  };
}

describe("billAudit", () => {
  it("flags a cycle whose bill jumped while its peak stayed flat", () => {
    // Five steady summer cycles at ~$1,270 / 56 kW, plus August inflated to $1,717
    // with the SAME 56 kW peak: dollars up, usage flat.
    const bills = [
      cycle(5, 1270, 56),
      cycle(6, 1275, 56),
      cycle(7, 1268, 56),
      cycle(8, 1717, 56), // <- the anomaly
      cycle(9, 1272, 56),
      cycle(10, 1274, 56),
    ];
    const recs = billAudit(input(bills));
    expect(recs).toHaveLength(1);
    const rec = recs[0]!;
    expect(rec.tool).toBe("bill-audit");
    expect(rec.severity).toBe("act");
    // Excess over the median of the other five (~$1,272).
    expect(rec.impactUsd).toBeGreaterThan(400);
    expect(rec.impactUsd).toBeLessThan(470);
    expect(rec.action.kind).toBe("audit_bill");
    expect((rec.action.params as { cycleStart: string }).cycleStart).toBe("2025-08-01");
  });

  it("does NOT flag a high bill when the peak rose to match it (real usage)", () => {
    // August costs more AND its peak is far higher: a genuine high-usage month.
    const bills = [
      cycle(5, 1270, 56),
      cycle(6, 1275, 56),
      cycle(7, 1268, 56),
      cycle(8, 1900, 120), // dollars up, but so is the peak
      cycle(9, 1272, 56),
      cycle(10, 1274, 56),
    ];
    expect(billAudit(input(bills))).toHaveLength(0);
  });

  it("does not flag when there are too few same-season comparators", () => {
    // Only two summer cycles besides the candidate: below the default minimum of 3.
    const bills = [cycle(6, 1270, 56), cycle(7, 1268, 56), cycle(8, 1717, 56)];
    expect(billAudit(input(bills))).toHaveLength(0);
  });

  it("compares within season, not across it", () => {
    // Winter bills run lower; an in-line summer cycle must not read as an anomaly just
    // because it tops the winter cycles.
    const bills = [
      cycle(6, 1270, 56),
      cycle(7, 1275, 56),
      cycle(8, 1268, 56),
      cycle(9, 1272, 56),
      cycle(1, 700, 40),
      cycle(2, 705, 40),
      cycle(12, 702, 40),
    ];
    expect(billAudit(input(bills))).toHaveLength(0);
  });

  it("ignores cycles with no peak on record (cannot confirm usage stayed flat)", () => {
    const noPeak = (m: number, t: number): CycleBill => ({ ...cycle(m, t, 0), peakKw: null });
    const bills = [
      cycle(5, 1270, 56),
      cycle(6, 1275, 56),
      cycle(7, 1268, 56),
      noPeak(8, 1717), // high bill but no peak to compare: skipped, not flagged
      cycle(9, 1272, 56),
    ];
    expect(billAudit(input(bills))).toHaveLength(0);
  });
});
