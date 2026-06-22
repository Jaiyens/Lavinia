// Rate-card model + the pure cost function. This is the counterfactual half of
// rate optimization: given a meter's bucketed usage, what would the SAME usage
// cost on a given PG&E ag rate? It never tells the farmer what they pay today
// (that is read from their real bills), it only prices alternatives so the
// engine can compare. The hardcoded $/kWh and $/kW live exclusively in the dated
// reference fixture (fixtures/pge-ag-rate-card.json) loaded by src/lib/pge.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in rates.test.ts.

import { centsFromDollars } from "@/lib/format/money";
import { roundUsd } from "./recommend";

export type Season = "summer" | "winter";
/** The TOU energy buckets a bill prices. The RATE peak window is 5-8pm year-round
 * (see tou.ts - distinct from the 4-9pm DR event window). partial_peak genuinely
 * bills only on legacy three-tier rates; current plans carry placeholder
 * partial_peak prices on the card but receive 0 kWh until a partial-peak window
 * is modeled. */
export type TouPeriod = "peak" | "partial_peak" | "off_peak";
/** Every TOU bucket, for exhaustive iteration (never silently drop billed kWh). */
export const TOU_PERIODS: readonly TouPeriod[] = ["peak", "partial_peak", "off_peak"];
/** PG&E splits each ag family at 35 kW: the small (X1) and large (X2) tiers. */
export type SizeClass = "small" | "large";

/** $/kWh for each TOU period within one season. */
export type EnergyPrices = Record<TouPeriod, number>;

/**
 * Demand charges, all $/kW applied to a billed peak kW. Absent entries mean the
 * rate has no such component. `peakPeriodDemandPerKw` is the summer peak-window
 * demand charge (AG-C / legacy AG-5); the peak window is the 5-8pm RATE peak
 * (tou.ts RATE_PEAK_WINDOW), never the 4-9pm DR event window.
 */
export type DemandPrices = {
  maxDemandPerKw?: number;
  peakPeriodDemandPerKw?: number;
};

export type SeasonPrices = {
  energy: EnergyPrices;
  demand: DemandPrices;
};

/** One rate schedule at one size class, the thing `cycleCostUnderPlan` prices against. */
export type RatePlan = {
  /** Tariff label, e.g. "AG-A2", "AG-C2", "AG-4". */
  schedule: string;
  /** Family the meter's stored rateSchedule maps to, e.g. "AG-A" | "AG-C" | "AG-4". */
  family: string;
  sizeClass: SizeClass;
  /** Closed/legacy schedule (AG-4/AG-5): a valid SOURCE but never a target. */
  legacy: boolean;
  /** Agricultural rate (gates non-ag meters out of ag candidates). */
  agricultural: boolean;
  customerChargePerMonth: number;
  /** $/day customer charge as the bill actually prints it ("18 days @ $1.19446").
   *  Required by the loader's validator; optional here so hand-built test cards
   *  for the legacy float path stay valid. */
  customerChargePerDay?: number;
  /** AG-C's published Demand Charge Limiter: the summer peak-period demand charge
   *  is capped at this $/kWh times the cycle's peak-period kWh (protects a
   *  low-load-factor meter from one random spike). Absent = no limiter. */
  demandChargeLimiterPerKwh?: number;
  /** Provenance: which of this plan's values are bill-sourced vs representative. */
  sourceNote?: string;
  summer: SeasonPrices;
  winter: SeasonPrices;
};

/** The committed, dated reference card. */
export type RateCard = {
  utility: string;
  effectiveDate: string;
  /** Card revision, e.g. "2026-06.1". Required by the loader's validator. */
  version?: string;
  source: string;
  /** Summer months as 1-12 (PG&E ag summer is May-Oct). */
  summerMonths: number[];
  /** The size-class boundary in kW (35). */
  sizeBreakKw: number;
  plans: RatePlan[];
};

/** kWh split by TOU period + the billed peaks for ONE billing cycle. */
export type CycleUsage = {
  start: string;
  close: string;
  season: Season;
  energyKwh: Record<TouPeriod, number>;
  /** Highest 15-min kW anywhere in the cycle (sets the max-demand charge). */
  maxDemandKw: number;
  /** Highest 15-min kW inside the peak window (sets the peak-period demand charge).
   *  LEGACY: bucketUsage fills this from its 4-9pm conflation; the correct window
   *  is the 5-8pm rate peak in tou.ts (the 3.3 lever rebuild). */
  peakWindowDemandKw: number;
};

/** Everything the engine needs about one meter, derived once from intervals + bills. */
export type MeterUsageProfile = {
  cycles: CycleUsage[];
  /** Peak kW across all cycles → drives size-class eligibility. */
  observedPeakKw: number;
};

/** Month (1-12) of an ISO instant or date-only string, in UTC (cycle starts are UTC midnight). */
function monthOf(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso).getUTCMonth() + 1;
}

/** Which billing season a month (or a cycle's start) falls in, per the card. */
export function seasonFor(monthOrIso: number | string, card: RateCard): Season {
  const month = typeof monthOrIso === "number" ? monthOrIso : monthOf(monthOrIso);
  return card.summerMonths.includes(month) ? "summer" : "winter";
}

/** Size class from a meter's observed peak: above the break is the large (X2) tier. */
export function sizeClassFor(peakKw: number, card: RateCard): SizeClass {
  return peakKw > card.sizeBreakKw ? "large" : "small";
}

/**
 * Canonicalize a raw rate code to a hyphenated card schedule.
 *
 * PG&E's bills, the "Download My Data" export's Rate Code column, and the grower's
 * master sheet all print UN-hyphenated billing-determinant codes ("HAGC", "AGC",
 * "HAGA2", "AG5B", "AG4C"), often with a leading "H" (the SmartRate/historical
 * prefix). The card and `familyOf` speak only hyphenated canonical schedules
 * ("AG-C2", "AG-5"), so without this step every real code falls through unpriceable.
 *
 * Steps: trim + uppercase + take the leading token (drop a "P0xx"/label descriptor);
 * strip a SINGLE leading "H" only when the remainder begins "AG" (so "HAGC"->"AGC"
 * but the non-ag "HB1"/"HB6" keep their H and never masquerade as ag); then map the
 * un-hyphenated token to its canonical hyphenated schedule. Legacy AG4x/AG5x fold to
 * the bare "AG-4"/"AG-5" families (the card carries no per-tier legacy rows). An "FB"
 * tail is the AG-B fixed variant -> AG-B2. Anything unrecognized (A1X, B1, E19P, OL1,
 * HB1, HB6 ...) returns its own trimmed uppercase token unchanged - it must stay
 * non-ag and unpriceable, never guessed onto a card row.
 */
export function canonicalSchedule(raw: string): string {
  const token = raw.trim().toUpperCase().split(/[\s(]/)[0] ?? "";
  if (token === "") return "";
  // Already hyphenated (card labels, or a bill that prints "AG-C2"): leave as-is.
  if (token.startsWith("AG-")) return token;
  // Strip a single leading H only when it fronts an "AG..." code (HAGC -> AGC).
  const t = token.startsWith("H") && token.slice(1).startsWith("AG") ? token.slice(1) : token;
  switch (t) {
    case "AGA1":
      return "AG-A1";
    case "AGA2":
      return "AG-A2";
    case "AGB":
    case "AGB1":
    case "AGB2":
    case "AGFB":
      return "AG-B2";
    case "AGC":
    case "AGC1":
    case "AGC2":
      return "AG-C2";
    default:
      break;
  }
  // Legacy AG-4* / AG-5* (un-hyphenated, any tier letter): fold to the bare family.
  const legacy = t.match(/^AG([45])[A-E]?$/);
  if (legacy) return `AG-${legacy[1] as string}`;
  return token;
}

/**
 * Normalize a stored rate schedule to its family:
 *  - current ag: "AG-C2"/"AG-C1"/"AG-C" → "AG-C" (a trailing size digit);
 *  - legacy ag: "AG-4B"/"AG-4"/"AG-5C"/"AG-5" → "AG-4"/"AG-5" (a trailing tier letter).
 * The legacy schedules print as AG-4A..AG-4E and AG-5A..AG-5E (and bare AG-4/AG-5); they
 * MUST fold to the "AG-4"/"AG-5" families so the runner's LEGACY_FAMILIES set classifies a
 * real meter on a closed rate, instead of leaving e.g. AG-4B unmatched and finding-less.
 *
 * `canonicalSchedule` runs FIRST so the raw billing codes the real data actually
 * carries ("HAGC", "AGC", "HAGA2", "AG5B", "AG4C") fold here too: HAGC/AGC -> AG-C,
 * AG5B -> AG-5, etc. Anything `canonicalSchedule` cannot place returns its own trimmed
 * uppercase token unchanged.
 */
export function familyOf(schedule: string): string {
  const s = canonicalSchedule(schedule);
  const current = s.match(/^(AG-[ABC])\d?$/);
  if (current) return current[1] as string;
  const legacy = s.match(/^(AG-[45])[A-E]?$/);
  if (legacy) return legacy[1] as string;
  return s;
}

/** The plan for a family + size class, or null if the card does not carry it. */
export function planFor(
  card: RateCard,
  schedule: string,
  sizeClass: SizeClass,
): RatePlan | null {
  const family = familyOf(schedule);
  return (
    card.plans.find((p) => p.family === family && p.sizeClass === sizeClass) ?? null
  );
}

/**
 * What one billing cycle's usage costs under one plan. Energy is priced per TOU
 * period in the cycle's season; the max-demand charge applies year round; the
 * peak-period demand charge applies in summer only (AG-C / AG-5). The monthly
 * customer charge is added once per cycle.
 */
export function cycleCostUnderPlan(usage: CycleUsage, plan: RatePlan): number {
  const sp = usage.season === "summer" ? plan.summer : plan.winter;
  const energy =
    usage.energyKwh.peak * sp.energy.peak +
    usage.energyKwh.partial_peak * sp.energy.partial_peak +
    usage.energyKwh.off_peak * sp.energy.off_peak;
  const maxDemand = (sp.demand.maxDemandPerKw ?? 0) * usage.maxDemandKw;
  const peakDemand =
    usage.season === "summer"
      ? (sp.demand.peakPeriodDemandPerKw ?? 0) * usage.peakWindowDemandKw
      : 0;
  return energy + maxDemand + peakDemand + plan.customerChargePerMonth;
}

/** Modeled annual cost of a meter's usage under a plan (sum of its cycles, rounded). */
export function annualCostUnderRate(
  profile: MeterUsageProfile,
  plan: RatePlan,
): number {
  return roundUsd(
    profile.cycles.reduce((sum, c) => sum + cycleCostUnderPlan(c, plan), 0),
  );
}

/**
 * One billing cycle as the canonical shape knows it: TOU kWh quantities from the
 * bill's energy line items, the BILLED demand kW, and the cycle's day count. No
 * interval data (the real account has none; FR-2 scopes it out). This is the input
 * the 3.3 back-test gate and 4.1 bill verification recompute from.
 */
export type CyclePriceInput = {
  /** Days the cycle spans (the bill prints the customer charge as days x $/day). */
  days: number;
  season: Season;
  /** kWh by TOU bucket. An ABSENT bucket means 0 kWh of usage in that bucket
   *  (the bill printed no line), not unknown data. */
  energyKwh: Partial<Record<TouPeriod, number>>;
  /** The billed max demand kW; null when the bill carries no demand line.
   *  Null prices the component at 0 - honest absence, never an invented kW. */
  maxDemandKw: number | null;
  /** The billed peak-window demand kW (AG-C/AG-5 summer); null/absent = none billed. */
  peakWindowDemandKw?: number | null;
};

/** Integer-cents breakdown mirroring how the bill prints its components. */
export type CyclePriceBreakdown = {
  customerCents: number;
  energyCents: number;
  demandCents: number;
  totalCents: number;
};

/**
 * Price one cycle under one plan in INTEGER CENTS (AR-6: anything compared against
 * a printed bill total is cents, never a float dollar). Each component is rounded
 * to cents independently before summing, mirroring the bill's own rounded line
 * items. The customer charge prorates per day, exactly as printed. The AG-C
 * Demand Charge Limiter caps the summer PEAK-PERIOD demand component at
 * limiter $/kWh x peak-period kWh; it never touches the max-demand component.
 */
export function priceCycleCents(
  input: CyclePriceInput,
  plan: RatePlan,
): CyclePriceBreakdown {
  // Garbage in is a programming/extraction error, not a pricing question: fail loudly
  // rather than letting NaN/Infinity corrupt a figure the back-test gate will trust.
  // Negative kWh is allowed (NEM export is a real input class); negative days/kW are not.
  if (!Number.isFinite(input.days) || input.days < 0) {
    throw new Error(`priceCycleCents: invalid day count ${input.days}`);
  }
  for (const kwh of Object.values(input.energyKwh)) {
    if (kwh !== undefined && !Number.isFinite(kwh)) {
      throw new Error("priceCycleCents: non-finite energy kWh");
    }
  }
  for (const kw of [input.maxDemandKw, input.peakWindowDemandKw ?? null]) {
    if (kw !== null && (!Number.isFinite(kw) || kw < 0)) {
      throw new Error(`priceCycleCents: invalid demand kW ${kw}`);
    }
  }

  const sp = input.season === "summer" ? plan.summer : plan.winter;

  // Customer charge: prefer the per-day print; derive from the legacy monthly
  // figure only when a hand-built card omits it.
  const perDay = plan.customerChargePerDay ?? (plan.customerChargePerMonth * 12) / 365;
  const customerCents = centsFromDollars(input.days * perDay);

  // Energy: one rounded line per TOU bucket, like the bill prints them. Iterate the
  // full bucket union (the validator guarantees every season prices all three), so
  // billed kWh can never be silently dropped by a malformed hand-built season.
  const energyCents = TOU_PERIODS.reduce((sum, period) => {
    const kwh = input.energyKwh[period] ?? 0;
    return sum + centsFromDollars(kwh * (sp.energy[period] ?? 0));
  }, 0);

  // Max-demand charge: year-round where the plan carries it; null kW prices 0.
  const maxDemandCents =
    input.maxDemandKw !== null
      ? centsFromDollars(input.maxDemandKw * (sp.demand.maxDemandPerKw ?? 0))
      : 0;

  // Peak-period demand charge (summer-priced plans only), with the limiter cap.
  // The cap floors at 0: a negative or zero peak-kWh base must never turn the
  // demand component into a phantom credit.
  const peakKw = input.peakWindowDemandKw ?? null;
  let peakDemandCents = 0;
  if (peakKw !== null && sp.demand.peakPeriodDemandPerKw !== undefined) {
    const raw = peakKw * sp.demand.peakPeriodDemandPerKw;
    const cap =
      plan.demandChargeLimiterPerKwh !== undefined
        ? Math.max(0, plan.demandChargeLimiterPerKwh * (input.energyKwh.peak ?? 0))
        : Infinity;
    peakDemandCents = centsFromDollars(Math.min(raw, cap));
  }

  const demandCents = maxDemandCents + peakDemandCents;
  return {
    customerCents,
    energyCents,
    demandCents,
    totalCents: customerCents + energyCents + demandCents,
  };
}
