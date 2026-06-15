// The DB edge of ingestion: lands normalized meters onto a Farm as Pumps with their
// usage. Source-agnostic, it consumes NormalizedMeter[] from the normalize layer, so
// the same lander serves both the Green Button (ESPI) and Bayou paths. The parse +
// math it builds on are pure. Takes a PrismaClient so it runs against any database
// (the app singleton, a throwaway test db), same pattern as seedSampleFarm.
// Idempotent: re-importing the same feed is a no-op delta.

import type { PrismaClient } from "@prisma/client";
import { maxDemandInWindow } from "@/lib/energy";
import {
  normalizeBayou,
  normalizeEspi,
  normalizeUtilityApi,
  type BayouResponses,
  type NormalizedMeter,
  type UtilityApiResponses,
} from "@/lib/normalize";

export type ImportResult = {
  pumpsCreated: number;
  pumpsUpdated: number;
  intervals: number;
  billingPeriods: number;
  serviceIds: string[];
  /** Non-electric meters carried by the source but not persisted (engine is electric-only). */
  metersSkipped: number;
};

// New pumps need a name (a meter feed has none). Existing pumps keep their
// farmer-given name; only the metered fields are refreshed.
function deriveName(meter: NormalizedMeter): string {
  return `Service ${meter.serviceId}`;
}

/**
 * Sum metered kWh within a half-open cycle window [startIso, closeIso]. Returns null
 * when the meter carries no intervals in the window, so a summary-only cycle stays
 * honestly empty rather than reading as 0 kWh. A date-only close spans the close day.
 */
function sumKwhInWindow(
  intervals: NormalizedMeter["intervals"],
  startIso: string,
  closeIso: string,
): number | null {
  const lo = startIso;
  // Date-only close means "through the close day": bump to the next midnight.
  const hi =
    closeIso.length === 10
      ? new Date(new Date(`${closeIso}T00:00:00.000Z`).getTime() + 86_400_000).toISOString()
      : closeIso;
  let total = 0;
  let any = false;
  for (const r of intervals) {
    if (r.start >= lo && r.start < hi) {
      total += r.kWh;
      any = true;
    }
  }
  return any ? Math.round(total * 100) / 100 : null;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Resolve a meter's account number to a first-class Account, creating it on the farm
 * if new. Returns null when the source carries no account number (the standard ESPI
 * feed), in which case the pump links up later via the spreadsheet. The Entity above
 * the account is left unset until the spreadsheet assigns it.
 */
async function resolveAccountId(
  tx: Tx,
  farmId: string,
  accountNumber: string | null,
): Promise<string | null> {
  if (!accountNumber) return null;
  const account = await tx.account.upsert({
    where: { farmId_number: { farmId, number: accountNumber } },
    update: {},
    create: { farmId, number: accountNumber },
  });
  return account.id;
}

/**
 * Upsert each normalized meter onto `farmId`:
 * - the Pump (matched by stable service ID; rateSchedule, location, meterSerial, and
 *   account link refreshed from the feed, human name preserved),
 * - its BillingPeriods (one per cycle, with the derived max-demand peak), and
 * - its 15-minute UsageIntervals (replaced within the imported window).
 *
 * Gas (and any non-electric) meters are dropped before persistence and counted in
 * `metersSkipped`; only electric meters become Pumps.
 */
export async function importMeters(
  prisma: PrismaClient,
  { meters, farmId, source }: { meters: NormalizedMeter[]; farmId: string; source: string },
): Promise<ImportResult> {
  const electric = meters.filter((m) => m.fuel === "electric");

  const result: ImportResult = {
    pumpsCreated: 0,
    pumpsUpdated: 0,
    intervals: 0,
    billingPeriods: 0,
    serviceIds: electric.map((m) => m.serviceId),
    metersSkipped: meters.length - electric.length,
  };

  await prisma.$transaction(async (tx) => {
    for (const m of electric) {
      const accountId = await resolveAccountId(tx, farmId, m.accountNumber);

      const existing = await tx.pump.findUnique({
        where: { farmId_serviceId: { farmId, serviceId: m.serviceId } },
      });

      const pump = await tx.pump.upsert({
        where: { farmId_serviceId: { farmId, serviceId: m.serviceId } },
        update: {
          // `?? undefined` leaves a column untouched when the feed lacks the value.
          rateSchedule: m.tariff ?? undefined,
          location: m.address ?? undefined,
          meterSerial: m.meterSerial ?? undefined,
          accountId: accountId ?? undefined,
        },
        create: {
          farmId,
          serviceId: m.serviceId,
          name: deriveName(m),
          rateSchedule: m.tariff,
          location: m.address,
          meterSerial: m.meterSerial,
          fuel: m.fuel,
          accountId,
        },
      });
      if (existing) result.pumpsUpdated += 1;
      else result.pumpsCreated += 1;

      // One BillingPeriod per cycle, carrying the derived peak that sets the charge.
      for (const summary of m.summaries) {
        const peak = maxDemandInWindow(m.intervals, summary.start, summary.close);
        // Total cycle energy, summed from the real metered intervals in the window.
        // Stays null for summary-only meters (no interval history to sum), which is
        // the honest state: fleet usage reads what is actually metered.
        const cycleKwh = sumKwhInWindow(m.intervals, summary.start, summary.close);
        const data = {
          tariff: summary.tariff,
          close: new Date(summary.close),
          demandChargeUsd: summary.demandChargeUsd,
          totalBillUsd: summary.totalBillUsd,
          totalKwh: cycleKwh,
          peakKw: peak?.kw ?? null,
          peakAt: peak ? new Date(peak.at) : null,
          source,
        };
        await tx.billingPeriod.upsert({
          where: { pumpId_start: { pumpId: pump.id, start: new Date(summary.start) } },
          update: data,
          create: { pumpId: pump.id, start: new Date(summary.start), ...data },
        });
        result.billingPeriods += 1;
      }

      // Replace intervals within the imported window so re-imports are idempotent
      // without dropping any history outside this feed's span.
      if (m.intervals.length > 0) {
        const starts = m.intervals.map((r) => new Date(r.start));
        const min = new Date(Math.min(...starts.map((d) => d.getTime())));
        const max = new Date(Math.max(...starts.map((d) => d.getTime())));
        await tx.usageInterval.deleteMany({
          where: { pumpId: pump.id, start: { gte: min, lte: max } },
        });
        await tx.usageInterval.createMany({
          data: m.intervals.map((r) => ({
            pumpId: pump.id,
            start: new Date(r.start),
            durationSec: r.durationSec,
            kWh: r.kWh,
          })),
        });
        result.intervals += m.intervals.length;
      }
    }
  });

  return result;
}

export type ImportOptions = {
  xml: string;
  farmId: string;
};

/** Parse a Green Button / ESPI feed and land it. Thin wrapper over importMeters. */
export async function importGreenButton(
  prisma: PrismaClient,
  { xml, farmId }: ImportOptions,
): Promise<ImportResult> {
  return importMeters(prisma, {
    meters: normalizeEspi(xml),
    farmId,
    source: "green_button",
  });
}

export type ImportBayouOptions = {
  pull: BayouResponses;
  farmId: string;
};

/** Normalize a Bayou v2 pull (customer + bills + intervals) and land it. */
export async function importBayou(
  prisma: PrismaClient,
  { pull, farmId }: ImportBayouOptions,
): Promise<ImportResult> {
  return importMeters(prisma, {
    meters: normalizeBayou(pull),
    farmId,
    source: "bayou",
  });
}

export type ImportUtilityApiOptions = {
  pull: UtilityApiResponses;
  farmId: string;
};

/**
 * Normalize a UtilityAPI pull (native /meters JSON + Green Button XML per meter) and
 * land it. The hybrid normalizer fills the account number + serial the standard ESPI
 * feed drops, so importMeters resolves one Account per distinct PG&E account number,
 * the multi-account path (Batth: ~57 accounts) Bayou could not enumerate.
 */
export async function importUtilityApi(
  prisma: PrismaClient,
  { pull, farmId }: ImportUtilityApiOptions,
): Promise<ImportResult> {
  return importMeters(prisma, {
    meters: normalizeUtilityApi(pull),
    farmId,
    source: "utilityapi",
  });
}
