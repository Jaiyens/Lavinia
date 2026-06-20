// Bill audit: flag a posted cycle whose total came in higher than the meter's own
// usual comparable cycle while its metered usage did NOT rise to match. This is the
// honest, retrospective audit signal: it never re-prices the bill (that would only
// say "our model disagrees with PG&E"), it compares the farmer's own bills to each
// other. A cycle is suspicious only when the dollars jump but the peak does not, so a
// genuine high-usage month (a real demand spike) is never mistaken for an overcharge.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in bill-audit.test.ts.

import { en } from "@/copy/en";
import { draftRecommendation } from "@/lib/recommendations";
import type { DraftRecommendation } from "@/lib/recommendations";
import { roundUsd } from "./recommend";
import type { CycleBill } from "./types";

/** The `tool` tag on every recommendation this module emits. */
export const BILL_AUDIT_TOOL = "bill-audit";

export type BillAuditInput = {
  farmId: string;
  pumpId: string;
  pumpName: string;
  /** The meter's posted cycles (totalBillUsd + peakKw drive the check). */
  bills: readonly CycleBill[];
  /** Summer months as 1-12, from the rate card, so seasons match the bills. */
  summerMonths: readonly number[];
  /** Local "today"; becomes the recs' createdAt. */
  asOf: string;
  /** A cycle's total must top its same-season median by more than this to flag. Default 0.25. */
  billTolerance?: number;
  /** ...while its peak stays within this of the median peak (usage did not jump). Default 0.12. */
  peakTolerance?: number;
  /** Need at least this many comparable same-season cycles for a stable median. Default 3. */
  minComparators?: number;
  /**
   * No-peak path (a real bill-PDF / summary-only meter with no interval or demand data, so
   * no peakKw to prove usage stayed flat): a cycle's total must top its same-season median
   * by MORE than this to flag. Set well above billTolerance (default 0.5) because without a
   * peak we cannot rule out a genuine high-usage month, so only a clearly anomalous bill
   * surfaces, and at "watch" (not "act"), honest framing for an unconfirmed signal.
   */
  noPeakBillTolerance?: number;
};

/** Month (1-12) of an ISO instant or date-only string, in UTC. */
function monthOf(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso).getUTCMonth() + 1;
}

/** Median of a non-empty list; 0 for an empty one (callers gate on count first). */
function median(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Audit a meter's bills for one-cycle anomalies. For each cycle with a total, compare it
 * to the median of the meter's OTHER same-season cycles.
 *
 * Two paths, by whether the meter carries a peak (interval/demand history):
 *  - With a peak: flag when the dollars exceed the median by more than `billTolerance`
 *    AND the peak stays within `peakTolerance` of the median peak (spend rose without
 *    usage rising). The precise, "act"-severity signal.
 *  - Without a peak (a real bill-PDF / summary-only meter, the live ingestion's common
 *    case): there is no peak to prove usage stayed flat, so flag only when the dollars
 *    exceed the median by more than the stricter `noPeakBillTolerance`, at "watch" not
 *    "act", honest framing for an unconfirmed signal. Previously these bills were
 *    discarded outright, which left a real bill-PDF farm with zero audit findings.
 *
 * Emits one recommendation per flagged cycle, carrying the dollar excess as the impact.
 */
export function billAudit(input: BillAuditInput): DraftRecommendation[] {
  const billTolerance = input.billTolerance ?? 0.25;
  const peakTolerance = input.peakTolerance ?? 0.12;
  const noPeakBillTolerance = input.noPeakBillTolerance ?? 0.5;
  const minComparators = input.minComparators ?? 3;
  const summer = new Set(input.summerMonths);

  const seasonOf = (iso: string): "summer" | "winter" =>
    summer.has(monthOf(iso)) ? "summer" : "winter";

  const hasPeak = (b: CycleBill): boolean => b.peakKw != null && b.peakKw > 0;

  const recs: DraftRecommendation[] = [];

  for (const bill of input.bills) {
    // A bill with no total cannot be audited; a bill with a total but no peak takes the
    // stricter no-peak path below (it is no longer discarded).
    if (bill.totalBillUsd == null) continue;
    const season = seasonOf(bill.start);
    const billHasPeak = hasPeak(bill);

    if (billHasPeak) {
      // The meter's OTHER cycles in the same season, with a total and a usable peak.
      const peers = input.bills.filter(
        (b) => b !== bill && b.totalBillUsd != null && hasPeak(b) && seasonOf(b.start) === season,
      );
      if (peers.length < minComparators) continue;

      const medianTotal = median(peers.map((b) => b.totalBillUsd as number));
      const medianPeak = median(peers.map((b) => b.peakKw as number));
      if (medianTotal <= 0 || medianPeak <= 0) continue;

      const billRatio = bill.totalBillUsd / medianTotal;
      const peakRatio = (bill.peakKw as number) / medianPeak;

      // Dollars jumped, usage did not: the audit signal. A real high-usage month moves
      // the peak too, so its peakRatio clears the tolerance and it is left alone.
      if (billRatio <= 1 + billTolerance) continue;
      if (peakRatio > 1 + peakTolerance) continue;

      const excessUsd = roundUsd(bill.totalBillUsd - medianTotal);
      const month = en.pumpTiming.monthLabel(monthOf(bill.start) - 1);

      recs.push(
        draftRecommendation({
          tool: BILL_AUDIT_TOOL,
          farmId: input.farmId,
          severity: "act",
          createdAt: input.asOf,
          situation: en.billAudit.situation(input.pumpName, month),
          impactUsd: excessUsd,
          impactNote: en.billAudit.impact(excessUsd, month),
          action: {
            kind: "audit_bill",
            label: en.billAudit.action(month),
            params: {
              pumpId: input.pumpId,
              cycleStart: bill.start,
              cycleClose: bill.close,
              totalBillUsd: roundUsd(bill.totalBillUsd),
              medianTotalUsd: roundUsd(medianTotal),
              excessUsd,
              peakKw: roundUsd(bill.peakKw as number),
              medianPeakKw: roundUsd(medianPeak),
            },
            execute: null,
          },
        }),
      );
      continue;
    }

    // No-peak path: compare totals against same-season peers that also lack a peak (so the
    // two paths never cross-contaminate). Stricter threshold, "watch" severity.
    const peers = input.bills.filter(
      (b) => b !== bill && b.totalBillUsd != null && !hasPeak(b) && seasonOf(b.start) === season,
    );
    if (peers.length < minComparators) continue;

    const medianTotal = median(peers.map((b) => b.totalBillUsd as number));
    if (medianTotal <= 0) continue;

    const billRatio = bill.totalBillUsd / medianTotal;
    if (billRatio <= 1 + noPeakBillTolerance) continue;

    const excessUsd = roundUsd(bill.totalBillUsd - medianTotal);
    const month = en.pumpTiming.monthLabel(monthOf(bill.start) - 1);

    recs.push(
      draftRecommendation({
        tool: BILL_AUDIT_TOOL,
        farmId: input.farmId,
        severity: "watch",
        createdAt: input.asOf,
        situation: en.billAudit.situation(input.pumpName, month),
        impactUsd: excessUsd,
        impactNote: en.billAudit.impact(excessUsd, month),
        action: {
          kind: "audit_bill",
          label: en.billAudit.action(month),
          params: {
            pumpId: input.pumpId,
            cycleStart: bill.start,
            cycleClose: bill.close,
            totalBillUsd: roundUsd(bill.totalBillUsd),
            medianTotalUsd: roundUsd(medianTotal),
            excessUsd,
            peakKw: null,
            medianPeakKw: null,
          },
          execute: null,
        },
      }),
    );
  }

  return recs;
}
