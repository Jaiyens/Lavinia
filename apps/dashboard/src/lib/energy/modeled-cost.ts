// Modeled cost: usage x published PG&E tariff = estimated spend, for a usage-only
// import that has no bills. This is the "UtilityAPI in our thing" calculation —
// UtilityAPI gives you intervals + a tariff NAME, never the dollars; the rate math is
// ours. It turns the Download My Data export (15-min kWh, each interval labeled with a
// TOU Code) into an estimated monthly bill per meter, reusing the dated rate card and
// the integer-cents pricer.
//
// SCOPE (honest): the TARIFF COMPONENT only — TOU energy + demand + customer charge.
// It EXCLUDES taxes/franchise fees, non-bypassable charges (NBC/PCIA), the climate
// credit, CARE, and NEM true-up. So a modeled figure is "estimated tariff cost," within
// ~5% of the tariff portion of the real bill, NOT the out-of-pocket total. A meter on a
// schedule the card does not carry (commercial B1/HB1/A1X/E19P/HE1...) is returned
// UNPRICED (priced=false) — never a guessed number.
//
// Pure: no DB, no clock; the only IO is loadRateCard()'s one fixture read. Reuses
// priceCycleCents (rates.ts), intervalKw (demand.ts), and the rate card. Tested in
// modeled-cost.test.ts.

import { loadRateCard } from "@/lib/pge/rate-card";
import { intervalKw } from "./demand";
import {
  type CyclePriceBreakdown,
  familyOf,
  planFor,
  type RateCard,
  type Season,
  seasonFor,
  sizeClassFor,
  priceCycleCents,
  type TouPeriod,
} from "./rates";
import type { IntervalReading } from "./types";

/** Average days in a month, for scaling a partial window to a monthly run-rate. */
const DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 86_400_000;

/**
 * Classify a PG&E export TOU code into a card bucket. Mirrors rate-compare.ts's
 * touPeriodForCode: drop the leading season letter (S/W), then PK->peak, PP->partial_peak,
 * SO/OP->off_peak. A code we cannot place (e.g. an empty cell on a non-TOU meter) returns
 * null and the caller folds that energy into off_peak so kWh is never dropped.
 */
export function touPeriodForCode(touCode: string | null | undefined): TouPeriod | null {
  if (!touCode) return null;
  const c = touCode.trim().toUpperCase();
  const suffix = /^[WS]/.test(c) ? c.slice(1) : c;
  if (suffix === "PK") return "peak";
  if (suffix === "PP") return "partial_peak";
  if (suffix === "SO" || suffix === "OP") return "off_peak";
  return null;
}

/** A single meter's modeled monthly cost (cents), or an honest "unpriced" reason. */
export type ModeledMeterCost = {
  serviceId: string;
  /** Raw rate code as imported (e.g. "HAGC"); the card family it resolved to, or null. */
  rateCode: string | null;
  family: string | null;
  /** False when no usage or the schedule is not on the card; see `reason`. */
  priced: boolean;
  reason: string | null;
  season: Season | null;
  /** The metered window actually present in the data. */
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: number;
  /** Import (consumption) kWh in the window, by TOU bucket, and the total. */
  energyKwh: Record<TouPeriod, number>;
  totalImportKwh: number;
  /** Export (solar to grid) kWh in the window — informational; not priced here. */
  exportKwh: number;
  /** Highest 15-min kW in the window (drives the demand charge); peak-window subset. */
  maxDemandKw: number;
  peakWindowDemandKw: number;
  /** Modeled MONTHLY cost: window energy scaled to a full month + a month's demand +
   *  a month's customer charge. Cents. Zero when unpriced. */
  monthlyCents: number;
  /** The monthly cost's component breakdown (cents). */
  breakdown: CyclePriceBreakdown;
};

const EMPTY_ENERGY: Record<TouPeriod, number> = { peak: 0, partial_peak: 0, off_peak: 0 };

/**
 * Model one meter's monthly tariff cost from its raw interval readings.
 *
 * The export is usually a partial window (this file is 9 days), so we do NOT pretend to
 * print a bill: we compute a MONTHLY RUN-RATE. Energy is summed over the window then
 * scaled to a 30.44-day month; the customer charge is a full month; the demand charge
 * uses the window's observed 15-min peak (a CONSERVATIVE floor — a 9-day window
 * under-observes the true monthly peak). Only IMPORT (delivered) intervals are priced;
 * export (solar) kWh is reported separately and never billed as consumption.
 */
export function modelMeterCost(
  serviceId: string,
  rateCode: string | null,
  intervals: readonly IntervalReading[],
  card: RateCard,
): ModeledMeterCost {
  const base: ModeledMeterCost = {
    serviceId,
    rateCode,
    family: rateCode ? familyOf(rateCode) : null,
    priced: false,
    reason: null,
    season: null,
    windowStart: null,
    windowEnd: null,
    windowDays: 0,
    energyKwh: { ...EMPTY_ENERGY },
    totalImportKwh: 0,
    exportKwh: 0,
    maxDemandKw: 0,
    peakWindowDemandKw: 0,
    monthlyCents: 0,
    breakdown: { customerCents: 0, energyCents: 0, demandCents: 0, totalCents: 0 },
  };

  const imports = intervals.filter((iv) => (iv.direction ?? "import") === "import");
  base.exportKwh =
    Math.round(
      intervals
        .filter((iv) => iv.direction === "export")
        .reduce((s, iv) => s + iv.kWh, 0) * 100,
    ) / 100;

  if (imports.length === 0) {
    base.reason = "no usage in window";
    return base;
  }

  // Window span (ms): from the earliest interval start to the latest interval end.
  let minMs = Infinity;
  let maxEndMs = -Infinity;
  const energy: Record<TouPeriod, number> = { peak: 0, partial_peak: 0, off_peak: 0 };
  let totalKwh = 0;
  let maxDemandKw = 0;
  let peakWindowDemandKw = 0;
  for (const iv of imports) {
    const startMs = new Date(iv.start).getTime();
    const endMs = startMs + iv.durationSec * 1000;
    if (startMs < minMs) minMs = startMs;
    if (endMs > maxEndMs) maxEndMs = endMs;
    const period = touPeriodForCode(iv.touCode) ?? "off_peak";
    energy[period] += iv.kWh;
    totalKwh += iv.kWh;
    const kw = intervalKw(iv);
    if (kw > maxDemandKw) maxDemandKw = kw;
    if (period === "peak" && kw > peakWindowDemandKw) peakWindowDemandKw = kw;
  }

  const windowStart = new Date(minMs).toISOString();
  const windowEnd = new Date(maxEndMs).toISOString();
  const windowDays = (maxEndMs - minMs) / MS_PER_DAY;
  const season = seasonFor(windowStart, card);

  base.windowStart = windowStart;
  base.windowEnd = windowEnd;
  base.windowDays = Math.round(windowDays * 100) / 100;
  base.energyKwh = {
    peak: Math.round(energy.peak * 100) / 100,
    partial_peak: Math.round(energy.partial_peak * 100) / 100,
    off_peak: Math.round(energy.off_peak * 100) / 100,
  };
  base.totalImportKwh = Math.round(totalKwh * 100) / 100;
  base.maxDemandKw = Math.round(maxDemandKw * 100) / 100;
  base.peakWindowDemandKw = Math.round(peakWindowDemandKw * 100) / 100;
  base.season = season;

  if (windowDays <= 0) {
    base.reason = "window has zero duration";
    return base;
  }

  const sizeClass = sizeClassFor(maxDemandKw, card);
  const plan = planFor(card, rateCode ?? "", sizeClass);
  if (!plan) {
    base.reason = rateCode ? `rate not loaded (${familyOf(rateCode)})` : "no rate code";
    return base;
  }

  // Scale the window's energy to a full month; demand + customer charge are monthly.
  const scale = DAYS_PER_MONTH / windowDays;
  const monthlyEnergy: Record<TouPeriod, number> = {
    peak: energy.peak * scale,
    partial_peak: energy.partial_peak * scale,
    off_peak: energy.off_peak * scale,
  };
  const breakdown = priceCycleCents(
    {
      days: DAYS_PER_MONTH,
      season,
      energyKwh: monthlyEnergy,
      maxDemandKw,
      peakWindowDemandKw,
    },
    plan,
  );

  base.priced = true;
  base.breakdown = breakdown;
  base.monthlyCents = breakdown.totalCents;
  return base;
}

/** One meter as the modeler consumes it: identity + its raw interval readings. */
export type MeterIntervals = {
  serviceId: string;
  rateCode: string | null;
  accountNumber: string | null;
  intervals: readonly IntervalReading[];
};

/** Modeled spend rolled up to one billing account. */
export type AccountSpend = {
  accountNumber: string;
  meters: number;
  pricedMeters: number;
  monthlyCents: number;
};

export type ModeledSpendReport = {
  effectiveDate: string;
  cardVersion: string | null;
  season: Season | null;
  meters: ModeledMeterCost[];
  byAccount: AccountSpend[];
  totals: {
    meters: number;
    pricedMeters: number;
    unpricedMeters: number;
    /** Modeled monthly tariff spend across all PRICED meters, cents. */
    monthlyCents: number;
  };
};

/**
 * Model the whole farm: price every meter, roll modeled monthly spend up by account, and
 * total it. The total counts only PRICED meters (an unpriced commercial meter contributes
 * 0 and is surfaced in `unpricedMeters`, never silently folded into the spend).
 */
export function modelFarmSpend(
  meters: readonly MeterIntervals[],
  card: RateCard = loadRateCard(),
): ModeledSpendReport {
  const priced = meters.map((m) =>
    modelMeterCost(m.serviceId, m.rateCode, m.intervals, card),
  );
  const accountOf = new Map<string, MeterIntervals>(meters.map((m) => [m.serviceId, m]));

  const accounts = new Map<string, AccountSpend>();
  for (const mc of priced) {
    const acct = accountOf.get(mc.serviceId)?.accountNumber ?? "unknown";
    const row = accounts.get(acct) ?? {
      accountNumber: acct,
      meters: 0,
      pricedMeters: 0,
      monthlyCents: 0,
    };
    row.meters += 1;
    if (mc.priced) {
      row.pricedMeters += 1;
      row.monthlyCents += mc.monthlyCents;
    }
    accounts.set(acct, row);
  }

  const pricedMeters = priced.filter((m) => m.priced).length;
  const seasons = new Set(priced.map((m) => m.season).filter(Boolean));
  return {
    effectiveDate: card.effectiveDate,
    cardVersion: card.version ?? null,
    season: seasons.size === 1 ? (seasons.values().next().value as Season) : null,
    meters: priced,
    byAccount: [...accounts.values()].sort((a, b) => b.monthlyCents - a.monthlyCents),
    totals: {
      meters: priced.length,
      pricedMeters,
      unpricedMeters: priced.length - pricedMeters,
      monthlyCents: priced.reduce((s, m) => s + m.monthlyCents, 0),
    },
  };
}
