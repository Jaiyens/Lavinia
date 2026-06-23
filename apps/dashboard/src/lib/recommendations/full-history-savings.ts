// FULL-HISTORY savings CORE: price each meter's REAL 12-month interval usage (the
// Download-My-Data history) under its current rate and every eligible alternative,
// and return the ANNUAL rate-switch savings per meter. The bill PDFs are ~1 cycle/
// meter, which starves the bills-lever; the interval history is a full year, so this
// prices the whole year of real usage against PG&E's published rate card.
//
// LIMITER-CORRECT: prices via priceCycleCents, which applies the AG-C summer Demand
// Charge Limiter (cycleCostUnderPlan omits it and overstates AG-C demand). AG-B has
// NO demand ceiling (PG&E Schedule AG, verified), so a >35 kW meter may elect it; the
// rate comparison decides whether it actually saves.
//
// TRUST: a meter's savings is "confirmed" only when its real printed bill reconciles
// to the card within the back-test band (reconcileMeter) - i.e. the card prices THIS
// meter right, so the 12-month projection on the same card is defensible. Meters whose
// bill does not yet reconcile are "pending-reconcile" (real usage, needs more bills).
//
// Pure of writes (reads via prisma); shared by the CLI, the persist step, and any
// future dashboard/cron. Every dollar is the engine's own; nothing is invented.

import type { PrismaClient } from "@prisma/client";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadRateCard } from "@/lib/pge/rate-card";
import { bucketUsage } from "@/lib/energy/rate-compare";
import { priceCycleCents, type MeterUsageProfile, type RatePlan } from "@/lib/energy/rates";
import { mapScheduleLabel } from "@/lib/energy/rate-lever";
import { reconcileMeter } from "@/lib/energy/back-test-report";
import { backTestTolerance } from "@/lib/energy/back-test-config";
import { isSolarNemMeter } from "@/lib/energy/solar-meter";
import type { CycleBill, IntervalReading } from "@/lib/energy/types";

// Candidate target schedules by real size tier (mirrors the lever's CANDIDATE_SCHEDULES).
const CANDIDATE: Record<"small" | "large", readonly string[]> = {
  small: ["AG-A1", "AG-A2"],
  large: ["AG-B2", "AG-C2"],
};
// Meters peaking >= this for 3 consecutive months may be PDP-defaulted (an opt-out-able
// event-pricing overlay, not modeled here) - flagged, never a blocker.
const PDP_FLAG_KW = 200;

export type MeterSaving = {
  pumpId: string;
  name: string;
  serviceId: string | null;
  fromSchedule: string;
  toSchedule: string;
  annualSavingsCents: number;
  /** confirmed = bill reconciles to card; pending_reconcile = real usage but bill unconfirmed. */
  status: "confirmed" | "pending_reconcile";
  observedPeakKw: number;
  /** True when the meter may be PDP-defaulted (>=200 kW); a quoting caveat, not a bar. */
  pdpFlag: boolean;
};

export type FullHistorySavings = {
  farmId: string;
  farmName: string;
  rateCardVersion: string | null;
  consideredMeters: number;
  results: MeterSaving[];
};

function monthsBetween(minIso: string, maxIso: string): CycleBill[] {
  const out: CycleBill[] = [];
  const start = new Date(minIso);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const end = new Date(maxIso);
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const s = new Date(Date.UTC(y, m, 1));
    const e = new Date(Date.UTC(y, m + 1, 0));
    out.push({
      start: s.toISOString().slice(0, 10),
      close: e.toISOString().slice(0, 10),
      tariff: null,
      demandChargeUsd: null,
      peakKw: null,
      peakAt: null,
      totalBillUsd: null,
    });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

/** Limiter-correct annual cost in integer cents: sum priceCycleCents over the cycles. */
function annualCostCents(profile: MeterUsageProfile, plan: RatePlan): number {
  let cents = 0;
  for (const c of profile.cycles) {
    const days = Math.max(1, Math.round((Date.parse(c.close) - Date.parse(c.start)) / 86_400_000) + 1);
    cents += priceCycleCents(
      { days, season: c.season, energyKwh: c.energyKwh, maxDemandKw: c.maxDemandKw, peakWindowDemandKw: c.peakWindowDemandKw },
      plan,
    ).totalCents;
  }
  return cents;
}

/** Compute per-meter annual rate-switch savings from the full interval history. Read-only. */
export async function computeFullHistorySavings(
  prisma: PrismaClient,
  farmId: string,
): Promise<FullHistorySavings> {
  const card = loadRateCard();
  const tolerance = backTestTolerance();
  const farm = await prisma.farm.findUniqueOrThrow({ where: { id: farmId }, select: { timezone: true, name: true } });
  const tz = farm.timezone;
  const meters = await loadMetersForFarm(prisma, farmId);

  const results: MeterSaving[] = [];
  let consideredMeters = 0;

  for (const m of meters) {
    if (m.coverageState !== "reconciled" || isSolarNemMeter(m)) continue;

    const rawIntervals = await prisma.usageInterval.findMany({
      where: { pumpId: m.id },
      orderBy: { start: "asc" },
      select: { start: true, durationSec: true, kWh: true, touCode: true },
    });
    if (rawIntervals.length === 0) continue;
    const intervals: IntervalReading[] = rawIntervals.map((iv) => ({
      start: iv.start.toISOString(),
      durationSec: iv.durationSec,
      kWh: iv.kWh,
      touCode: iv.touCode,
    }));

    if (!m.rateSchedule) continue;
    const span = monthsBetween(intervals[0]!.start, intervals[intervals.length - 1]!.start);
    const profile = bucketUsage(intervals, span, tz, card);
    const mapped = mapScheduleLabel(m.rateSchedule, card, profile.observedPeakKw);
    if (!mapped) continue;
    consideredMeters++;
    const currentPlan = mapped.plan;

    const currentCents = annualCostCents(profile, currentPlan);
    const candidates = card.plans.filter(
      (p: RatePlan) =>
        p.agricultural && !p.legacy && p.family !== currentPlan.family &&
        CANDIDATE[mapped.realTier].includes(p.schedule),
    );
    let best: { plan: RatePlan; cents: number } | null = null;
    for (const c of candidates) {
      const cents = annualCostCents(profile, c);
      if (best === null || cents < best.cents) best = { plan: c, cents };
    }
    if (!best) continue;
    const savingsCents = currentCents - best.cents;
    if (savingsCents <= 0) continue;

    const rec = reconcileMeter({
      meter: { id: m.id, name: m.name, serviceId: m.serviceId, rateSchedule: m.rateSchedule },
      periods: m.periods, card, tolerance,
    });

    results.push({
      pumpId: m.id,
      name: m.name,
      serviceId: m.serviceId,
      fromSchedule: currentPlan.schedule,
      toSchedule: best.plan.schedule,
      annualSavingsCents: savingsCents,
      status: rec.pass ? "confirmed" : "pending_reconcile",
      observedPeakKw: Math.round(profile.observedPeakKw),
      pdpFlag: profile.observedPeakKw >= PDP_FLAG_KW,
    });
  }

  results.sort((a, b) => b.annualSavingsCents - a.annualSavingsCents);
  return { farmId, farmName: farm.name, rateCardVersion: card.version ?? null, consideredMeters, results };
}
