// The clean "same usage, two rates" comparator. Feature B (the Meters board) needs to
// answer one question per meter: take this cycle's EXACT billed usage and price it under
// two schedules - what does each cost, and what is the signed difference? That is the
// whole rate-optimization pitch in one number: identical kWh and kW, two rates, different
// dollars. Everything here builds on rates.ts priceCycleCents (the one rate-math source);
// this module only derives the CyclePriceInput from a canonical billing period and runs
// it through two plans. It never invents usage and never hardcodes a $/kWh or $/kW.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in rate-bill.test.ts.

import type { MeterPeriodView } from "@/lib/dashboard/load";
import {
  priceCycleCents,
  planFor,
  seasonFor,
  type CyclePriceBreakdown,
  type CyclePriceInput,
  type RateCard,
  type SizeClass,
  type TouPeriod,
} from "./rates";

const MS_PER_DAY = 86_400_000;

/**
 * Map a printed TOU energy line-item label to the card's bucket. The bill spells these
 * "Peak" / "Part-Peak" (or "Partial") / "Off-Peak"; anything else (e.g. "Super Off-Peak")
 * is not an ag-card bucket and returns null so its kWh is dropped rather than misbucketed.
 * Mirrors rate-lever's touBucketForLabel spelling tolerance.
 */
function touBucketForLabel(label: string | null): TouPeriod | null {
  if (label === null) return null;
  const l = label.trim().toLowerCase();
  if (l === "peak") return "peak";
  if (/^off[ -]?peak$/.test(l)) return "off_peak";
  // "Part-Peak", "Partial Peak", or the bare "Partial" the spec calls out.
  if (l === "partial" || /^part(ial)?[ -]?peak$/.test(l)) return "partial_peak";
  return null;
}

/** Whether a schedule string belongs to the AG-C / AG-5 families that bill a summer
 *  peak-period demand charge. Used to decide whether a summer cycle carries a
 *  peak-window demand kW (the card prices that component only for these families). */
function hasPeakPeriodDemand(card: RateCard, season: "summer" | "winter"): boolean {
  if (season !== "summer") return false;
  return card.plans.some(
    (p) => (season === "summer" ? p.summer : p.winter).demand.peakPeriodDemandPerKw !== undefined,
  );
}

/**
 * Derive the priceable cycle input from a canonical billing period. Days come from the
 * inclusive start..close span; season from the start month; energy kWh from the
 * tou_energy line items bucketed by label; max demand from the period's billed peak kW.
 * The peak-window demand kW is set to the billed peak only when the cycle is summer AND
 * the card models a peak-period demand charge (AG-C / AG-5 families) - otherwise null, so
 * winter cycles and cards without that component price it at 0 (honest absence, never an
 * invented kW). Returns null when the period is not priceable: no demand line AND no
 * energy kWh means there is nothing to price.
 */
export function cyclePriceInputFromPeriod(
  period: MeterPeriodView,
  card: RateCard,
): CyclePriceInput | null {
  const startMs = Date.parse(period.start);
  const closeMs = Date.parse(period.close);
  if (!Number.isFinite(startMs) || !Number.isFinite(closeMs) || closeMs < startMs) {
    return null;
  }
  // Inclusive span: a meter read on the 1st through the 30th is 30 days, matching how
  // cycleFromPeriod in rate-lever counts and how the customer charge prints.
  const days = Math.round((closeMs - startMs) / MS_PER_DAY) + 1;

  const season = seasonFor(period.start, card);

  const energyKwh: Partial<Record<TouPeriod, number>> = {};
  let sawEnergy = false;
  for (const li of period.lineItems) {
    if (li.kind !== "tou_energy") continue;
    const bucket = touBucketForLabel(li.label);
    if (bucket === null) continue;
    energyKwh[bucket] = (energyKwh[bucket] ?? 0) + (li.quantity ?? 0);
    sawEnergy = true;
  }

  const maxDemandKw = period.peakKw;
  // Not priceable: nothing was billed to price. (A zero-kWh demand-only cycle is still
  // priceable; a no-energy no-demand period is not.)
  if (!sawEnergy && maxDemandKw === null) return null;

  const peakWindowDemandKw =
    season === "summer" && maxDemandKw !== null && hasPeakPeriodDemand(card, season)
      ? maxDemandKw
      : null;

  return { days, season, energyKwh, maxDemandKw, peakWindowDemandKw };
}

/** One priced bill: the schedule + size class it was priced under and the cents breakdown. */
export type RateBill = {
  schedule: string;
  sizeClass: SizeClass;
  breakdown: CyclePriceBreakdown;
};

/**
 * Price one cycle input under one schedule + size class. Resolves the plan via planFor
 * (the card's row for that family + size class) and prices with priceCycleCents. Returns
 * null when the card carries no plan for that schedule/size (never guess a rate).
 */
export function rateBill(
  input: CyclePriceInput,
  schedule: string,
  sizeClass: SizeClass,
  card: RateCard,
): RateBill | null {
  const plan = planFor(card, schedule, sizeClass);
  if (plan === null) return null;
  return {
    schedule: plan.schedule,
    sizeClass,
    breakdown: priceCycleCents(input, plan),
  };
}

/** Two priced bills for the SAME usage plus the signed saving from switching. */
export type RateComparison = {
  from: RateBill;
  to: RateBill;
  /** from.total - to.total: positive = the `to` schedule is cheaper (a saving). */
  saveCents: number;
};

/**
 * Run the SAME cycle input through two schedules and report the signed difference.
 * saveCents = from.total - to.total, so a positive figure means moving to `toSchedule`
 * saves money on this identical usage. Returns null when either schedule has no card
 * plan at this size class (a comparison that cannot be priced honestly is no comparison).
 * This is Feature B's whole point: one usage, two rates, the dollar gap between them.
 */
export function compareRates(
  input: CyclePriceInput,
  fromSchedule: string,
  toSchedule: string,
  sizeClass: SizeClass,
  card: RateCard,
): RateComparison | null {
  const from = rateBill(input, fromSchedule, sizeClass, card);
  const to = rateBill(input, toSchedule, sizeClass, card);
  if (from === null || to === null) return null;
  return {
    from,
    to,
    saveCents: from.breakdown.totalCents - to.breakdown.totalCents,
  };
}
