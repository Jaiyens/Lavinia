// Pure derivations for the dashboard: the two hero figures and the three glance
// numbers, computed from already-fetched rows. No UI, no DB, no clock. Every number
// here traces to a real column (Recommendation.impactUsd, BillingPeriod totals) so the
// home screen can never show a figure that is not grounded in the meter data.

import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { DEMAND_CHARGE_TOOL } from "@/lib/energy/retrospective";
import { BILL_AUDIT_TOOL } from "@/lib/energy/bill-audit";

/** Tools whose savings are recurring annual money the farmer can bank (the green hero). */
export const SAVE_TOOLS: ReadonlySet<string> = new Set([RATE_OPTIMIZATION_TOOL]);
/** Tools whose dollars are money at risk on a recent bill (the red hero). */
export const RISK_TOOLS: ReadonlySet<string> = new Set([DEMAND_CHARGE_TOOL, BILL_AUDIT_TOOL]);

/** Electrical input a motor of one horsepower draws at load (1 hp = 0.746 kW). */
const KW_PER_HP = 0.746;

export type RecLike = {
  tool: string;
  severity: string;
  impactUsd: number | null;
};

export type Heroes = {
  /** Recurring annual savings from rate fixes (green). */
  saveUsd: number;
  /** Money at risk on recent bills: demand-charge spikes + bill-audit excess (red). */
  riskUsd: number;
  saveCount: number;
  riskCount: number;
  /** Open findings that need a look (severity above info). */
  actionableCount: number;
};

/** The two hero figures, from the farm's pending recommendations. */
export function heroes(recs: readonly RecLike[]): Heroes {
  let saveUsd = 0;
  let riskUsd = 0;
  let saveCount = 0;
  let riskCount = 0;
  let actionableCount = 0;
  for (const r of recs) {
    if (r.severity !== "info") actionableCount += 1;
    // Save = material rate switches only (severity "act"), never a low-confidence guess.
    if (SAVE_TOOLS.has(r.tool) && r.severity === "act" && r.impactUsd != null) {
      saveUsd += r.impactUsd;
      saveCount += 1;
    }
    if (RISK_TOOLS.has(r.tool) && r.impactUsd != null) {
      riskUsd += r.impactUsd;
      riskCount += 1;
    }
  }
  return {
    saveUsd: Math.round(saveUsd),
    riskUsd: Math.round(riskUsd),
    saveCount,
    riskCount,
    actionableCount,
  };
}

export type CyclePeriod = {
  /** Cycle close, ISO 8601 (groups the fleet into months). */
  close: string;
  totalBillUsd: number | null;
  totalKwh: number | null;
  /** Pump nameplate, for the water estimate. Null leaves the meter out of the water sum. */
  gpm: number | null;
  horsepower: number | null;
};

export type GlanceMetric = {
  value: number;
  /** Percent change vs the previous cycle; null when there is no prior cycle to compare. */
  trendPct: number | null;
  /** Whether any meter contributed (false renders an empty dash, never a fake 0). */
  hasData: boolean;
};

export type Glance = {
  spend: GlanceMetric;
  electric: GlanceMetric;
  /** Estimated water pumped (gallons), derived from energy and pump nameplate. */
  water: GlanceMetric;
};

/** Year-month bucket of an ISO instant/date, e.g. "2026-05". */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Estimated gallons pumped in a cycle from its metered energy and the pump nameplate. */
function estWaterGallons(p: CyclePeriod): number | null {
  if (p.totalKwh == null || !p.gpm || !p.horsepower) return null;
  const loadKw = p.horsepower * KW_PER_HP;
  if (loadKw <= 0) return null;
  const runHours = p.totalKwh / loadKw;
  return p.gpm * 60 * runHours;
}

type MonthAgg = { spend: number; spendN: number; kwh: number; kwhN: number; water: number; waterN: number };

function metric(
  latest: number,
  prev: number | null,
  hasData: boolean,
): GlanceMetric {
  const trendPct =
    prev != null && prev > 0 ? Math.round(((latest - prev) / prev) * 100) : null;
  return { value: Math.round(latest), trendPct, hasData };
}

/**
 * The three glance numbers for the most recent cycle, each with a trend vs the cycle
 * before it. Periods across all the farm's meters are bucketed by close month; the two
 * most recent buckets are compared. A metric with no contributing meter reports
 * hasData:false so the UI shows a dash rather than a fabricated zero.
 */
export function glance(periods: readonly CyclePeriod[]): Glance {
  const byMonth = new Map<string, MonthAgg>();
  for (const p of periods) {
    const key = monthKey(p.close);
    const agg =
      byMonth.get(key) ?? { spend: 0, spendN: 0, kwh: 0, kwhN: 0, water: 0, waterN: 0 };
    if (p.totalBillUsd != null) {
      agg.spend += p.totalBillUsd;
      agg.spendN += 1;
    }
    if (p.totalKwh != null) {
      agg.kwh += p.totalKwh;
      agg.kwhN += 1;
    }
    const water = estWaterGallons(p);
    if (water != null) {
      agg.water += water;
      agg.waterN += 1;
    }
    byMonth.set(key, agg);
  }

  const months = [...byMonth.keys()].sort();
  const latestKey = months[months.length - 1];
  const prevKey = months[months.length - 2];
  const latest = latestKey ? byMonth.get(latestKey)! : null;
  const prev = prevKey ? byMonth.get(prevKey)! : null;

  if (!latest) {
    const none: GlanceMetric = { value: 0, trendPct: null, hasData: false };
    return { spend: none, electric: none, water: none };
  }

  return {
    spend: metric(latest.spend, prev?.spend ?? null, latest.spendN > 0),
    electric: metric(latest.kwh, prev?.kwh ?? null, latest.kwhN > 0),
    water: metric(latest.water, prev?.water ?? null, latest.waterN > 0),
  };
}
