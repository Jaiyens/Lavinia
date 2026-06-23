// The reconciliation sweep CORE (the validation agent in batch form). Runs the
// deterministic engine across every meter that has a real billed PG&E bill in the
// database and aggregates a pass/fail reconciliation report: per meter the
// card-recomputed total vs the real printed total, the error, pass/fail against the
// configurable back-test band, the cause when it misses, the rate-card version, and
// the bill dates it reconciled against.
//
// It READS the engine and never modifies it: reconcileMeter is the same pure
// back-test (cycleFromPeriod -> backTestMeter) the rate-lever gate uses, so the
// sweep can never disagree with the engine. It writes NOTHING to the database.
//
// This is the function a nightly trigger will call once a live feed exists; it
// takes a PrismaClient and a band and returns the structured report. No external
// fetch or cron is built here. The CLI wrapper lives in scripts/verify-reconciliation.ts.

import type { PrismaClient } from "@prisma/client";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadRateCard } from "@/lib/pge/rate-card";
import {
  DEFAULT_BACK_TEST_BAND_PCT,
  PER_CYCLE_BAND_FACTOR,
  backTestTolerance,
} from "@/lib/energy/back-test-config";
import { reconcileMeter, type ReconciliationRecord } from "@/lib/energy/back-test-report";
import { isSolarNemMeter } from "@/lib/energy/solar-meter";

export type SweepOptions = {
  /** Aggregate back-test band, percent. Defaults to DEFAULT_BACK_TEST_BAND_PCT (env-overridable). */
  tolerance?: number;
  /** Explicit farm; omit to resolve the dashboard farm. */
  farmId?: string;
  /** Extra bands to report pass-rate at, so the default can be retuned empirically. */
  thresholds?: number[];
};

export type ThresholdPassRate = { bandPct: number; passCount: number; passRate: number };

export type SweepReport = {
  farmId: string;
  bandPct: number;
  rateCardVersion: string | null;
  cardEffectiveDate: string;
  /** Reconciled, non-solar meters considered (the billed-meter denominator). */
  meterCount: number;
  /** Meters with >= 1 testable cycle (the pass-rate denominator). */
  testableCount: number;
  /** Meters skipped because their schedule never mapped or no cycle was testable. */
  notTestableCount: number;
  passCount: number;
  /** passCount / testableCount; 0 when nothing is testable. */
  passRate: number;
  records: ReconciliationRecord[];
  failures: ReconciliationRecord[];
  passRateByThreshold: ThresholdPassRate[];
};

const DEFAULT_THRESHOLDS = [2, 3, 4, 5, 6];

/** Re-test a record's pass at a candidate band WITHOUT re-pricing: the per-cycle
 *  deviations are already computed, so this just re-applies the inequality. Lets the
 *  report show pass-rate at several bands from one sweep, so the default band can be
 *  chosen empirically from real data. */
export function passesAt(record: ReconciliationRecord, bandPct: number): boolean {
  if (record.pctError === null || record.perCycle.length === 0) return false;
  const perCycleBand = bandPct * PER_CYCLE_BAND_FACTOR;
  return (
    record.pctError <= bandPct &&
    record.perCycle.every((c) => Math.abs(c.deviationPct) <= perCycleBand)
  );
}

/**
 * Reconcile every billed meter on a farm and aggregate the report. Side-effect-free
 * beyond the reads (loadMetersForFarm); writes nothing. This is the exact function a
 * nightly trigger calls - it takes the PrismaClient and the band, and returns the
 * structured report.
 *
 * Solar/NEM meters are excluded (their monthly charge pages omit the energy that
 * settles at the annual true-up, so a back-test from them would mislead - the same
 * exclusion the rate-lever runner applies before pricing).
 */
export async function runReconciliationSweep(
  prisma: PrismaClient,
  opts: SweepOptions = {},
): Promise<SweepReport> {
  const bandPct = opts.tolerance ?? DEFAULT_BACK_TEST_BAND_PCT;
  const tolerance = backTestTolerance(bandPct);
  const card = loadRateCard();

  let farmId = opts.farmId;
  if (!farmId) {
    const resolved = await dashboardFarm(prisma);
    if (!resolved) throw new Error("no dashboard farm found and no farm id given");
    farmId = resolved.farm.id;
  }

  const meters = await loadMetersForFarm(prisma, farmId);
  const billed = meters.filter(
    (m) => m.coverageState === "reconciled" && !isSolarNemMeter(m),
  );

  const records = billed.map((m) =>
    reconcileMeter({
      meter: { id: m.id, name: m.name, serviceId: m.serviceId, rateSchedule: m.rateSchedule },
      periods: m.periods,
      card,
      tolerance,
    }),
  );

  const testable = records.filter((r) => r.perCycle.length > 0);
  const passCount = testable.filter((r) => r.pass).length;
  const failures = testable.filter((r) => !r.pass);

  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const passRateByThreshold: ThresholdPassRate[] = [...thresholds]
    .sort((a, b) => a - b)
    .map((t) => {
      const n = testable.filter((r) => passesAt(r, t)).length;
      return { bandPct: t, passCount: n, passRate: testable.length ? n / testable.length : 0 };
    });

  return {
    farmId,
    bandPct,
    rateCardVersion: card.version ?? null,
    cardEffectiveDate: card.effectiveDate,
    meterCount: billed.length,
    testableCount: testable.length,
    notTestableCount: records.length - testable.length,
    passCount,
    passRate: testable.length ? passCount / testable.length : 0,
    records,
    failures,
    passRateByThreshold,
  };
}
