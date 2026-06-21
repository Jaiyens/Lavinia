// Feature D's surface bridge: turn the pure refund detector into the drawer/rail finding,
// from the canonical MeterView + rate card. A meter that classifies as a pump but is billed
// on a commercial (non-ag) rate qualifies for a retroactive misclassification refund; this
// estimates the recoverable amount on the meter's trailing reconciled cycles and shapes the
// "Wrong rate class, refund may be owed" card, kept DISTINCT from a go-forward rate switch.
//
// BUILD NOTE (2026-06-20): the representative Batth demo seeds its B-1 meters as small, flat
// commercial loads (see prisma/batth-farm.ts: "Non-ag (B-1): a small, flat office/shop load")
// - i.e. genuine non-pumps - so on the current demo data NO meter qualifies and this returns
// []. That is correct, not a gap: a refund is only owed on a true misclassification. The pure
// detector (src/lib/energy/refund.ts) and its tests are wired and ready; when a real account
// carries a pump-shaped meter on a B rate, this lights up the finding automatically. We never
// fabricate a qualifying meter to make the card appear.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in refund-finding.test.ts.

import type { MeterView } from "@/lib/dashboard/load";
import { classifyMeter, type MeterSignature } from "@/lib/energy/classify";
import { cyclePriceInputFromPeriod, rateBill } from "@/lib/energy/rate-bill";
import { estimateRefund, isCommercialTariff, type RefundCycle } from "@/lib/energy/refund";
import { familyOf, sizeClassFor, type RateCard } from "@/lib/energy/rates";

/** The agricultural rate a misclassified pump should have been on, for re-pricing the trailing
 *  cycles. AG-B (ag with a demand charge) is the conservative, like-for-like ag equivalent of a
 *  commercial demand rate: it has the same max-demand structure, so the re-price is honest. */
const CORRECT_AG_SCHEDULE = "AG-B";

export type RefundFinding = {
  meterId: string;
  meterName: string;
  /** The commercial tariff the meter is wrongly billed on. */
  billedTariff: string;
  /** Conservative recoverable amount, integer cents, floored, "up to". */
  recoverableCents: number;
};

/**
 * Build a refund finding for one meter, or null when it does not qualify. The meter is
 * classified from a signature derived from its billed peak kW and tariff (MeterView carries no
 * raw intervals; the billed peak is the size signal and the commercial tariff is the rate
 * signal). It qualifies only when that verdict is "pump" AND the tariff is a commercial B
 * rate. Trailing reconciled cycles are re-priced on the correct ag schedule and the overpayment
 * summed (capped to 36 months in the detector). Returns null otherwise.
 */
export function refundFindingForMeter(meter: MeterView, card: RateCard): RefundFinding | null {
  const billedTariff = meter.rateSchedule;
  if (billedTariff === null || !isCommercialTariff(billedTariff)) return null;

  // Size signal: the largest billed peak across the meter's cycles (a pump motor draws tens of
  // kW; an office draws single digits - classifyMeter's threshold is 20 kW / 8 kW).
  const peaks = meter.periods.map((p) => p.peakKw).filter((k): k is number => k !== null && k > 0);
  const peakKw = peaks.length > 0 ? Math.max(...peaks) : null;
  const signature: MeterSignature = {
    peakKw,
    avgKw: null,
    // No interval shape from billed data; the tariff + size carry the verdict. A commercial
    // tariff with a pump-sized peak still classifies as a pump (ag-tariff bonus is absent, but
    // the size signal is decisive at >= 20 kW).
    loadFactor: null,
    tariff: billedTariff,
    readings: 0,
  };
  const classification = classifyMeter(signature);

  // Re-price each reconciled, priceable trailing cycle on the correct ag schedule.
  const cycles: RefundCycle[] = [];
  for (const period of meter.periods) {
    if (period.printedTotalCents === null) continue;
    const input = cyclePriceInputFromPeriod(period, card);
    if (input === null) continue;
    const sizeClass = sizeClassFor(input.maxDemandKw ?? 0, card);
    const ag = rateBill(input, CORRECT_AG_SCHEDULE, sizeClass, card);
    if (ag === null) continue;
    cycles.push({
      close: period.close,
      billedCents: period.printedTotalCents,
      agCostCents: ag.breakdown.totalCents,
      months: 1,
    });
  }

  const estimate = estimateRefund({
    classification: classification.kind,
    billedTariff,
    cycles,
  });
  if (!estimate.qualifies) return null;

  return {
    meterId: meter.id,
    meterName: meter.name,
    // The bill's printed family (e.g. "B-19" from "B-19S"), for the card copy.
    billedTariff: familyOf(billedTariff),
    recoverableCents: estimate.recoverableCents,
  };
}

/** All refund findings across a meter set (empty when none qualify). */
export function refundFindings(meters: readonly MeterView[], card: RateCard): RefundFinding[] {
  const out: RefundFinding[] = [];
  for (const meter of meters) {
    const finding = refundFindingForMeter(meter, card);
    if (finding !== null) out.push(finding);
  }
  return out;
}
