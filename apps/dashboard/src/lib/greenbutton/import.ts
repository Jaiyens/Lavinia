// The DB edge of ingestion: lands normalized meters onto a Farm as Pumps with their
// usage. Source-agnostic, it consumes NormalizedMeter[] from the normalize layer, so
// the same lander serves both the Green Button (ESPI) and Bayou paths. The parse +
// math it builds on are pure. Takes a PrismaClient so it runs against any database
// (the app singleton, a throwaway test db), same pattern as seedSampleFarm.
// Idempotent: re-importing the same feed is a no-op delta.

import type { PrismaClient } from "@prisma/client";
import { maxDemandInWindow } from "@/lib/energy";
import { centsFromDollars } from "@/lib/format/money";
import {
  normalizeBayou,
  normalizeDownloadMyData,
  normalizeEspi,
  normalizeUtilityApi,
  type BayouResponses,
  type NormalizedMeter,
  type NormalizedSummary,
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
  /** Electric meters whose per-meter commit threw and were skipped (the batch continues). */
  metersFailed: number;
};

// New pumps need a name (a meter feed has none). Existing pumps keep their
// farmer-given name; only the metered fields are refreshed.
function deriveName(meter: NormalizedMeter): string {
  return `Service ${meter.serviceId}`;
}

/**
 * The [earliest, latest] interval-start span for a meter, computed in a single pass.
 * Deliberately NOT `new Date(Math.min(...starts.map(d => d.getTime())))`: spreading a
 * high-history meter's interval array into a call throws "Maximum call stack size exceeded"
 * once it is large enough (a multi-year 15-minute series is 100k+ points, exactly the Batth
 * scale). That throw fires INSIDE importOneMeter's per-meter transaction, so it rolls the
 * whole meter back (Pump + billing periods + intervals) and the catch in importMeters counts
 * it in `metersFailed` with ZERO rows persisted - the meter silently vanishes from the import.
 * A reduce is unbounded-safe. Caller guarantees a non-empty array. Exported for the regression test.
 */
export function intervalSpan(
  intervals: readonly { start: string }[],
): { min: Date; max: Date } {
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const r of intervals) {
    const ms = new Date(r.start).getTime();
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }
  return { min: new Date(minMs), max: new Date(maxMs) };
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

// Per-meter interactive transactions far exceed Prisma's 5s default, so a 183-meter
// Batth import (or any Postgres latency once we move off the local cluster) cannot
// abort a meter with P2028. Each meter commits on its own (below), so this ceiling
// only ever has to cover ONE meter's writes, not the whole farm. Mirrors the pattern
// at src/lib/onboarding/farm.ts (importInventory's $transaction options).
const METER_TX_OPTIONS = { timeout: 120_000, maxWait: 15_000 } as const;

// Postgres caps a single statement's bind parameters (~65k); a meter with a year of
// 15-minute intervals (~35k rows x 4 columns) blows past it in one createMany. Chunk
// the rows so a high-history meter lands without a parameter-limit error.
const INTERVAL_CHUNK = 5_000;

/**
 * Build the reconciled BillingLineItems for one imported cycle so the money view (which
 * reads demand line items and reconciles to printedTotalCents) lights up. The summary
 * carries a demand-charge dollar figure and a total; we emit a demand line (when present)
 * and an energy line for the remainder, in integer cents, the same shape the bill-PDF
 * extractor and the Batth seed produce. The lines sum EXACTLY to printedTotalCents so the
 * cycle reconciles like a real extracted account; no per-bucket TOU split is attempted
 * (the ESPI/UtilityAPI summary does not carry one), so the energy is one flat line.
 *
 * The caller only invokes this for printedTotalCents > 0 (a zero/net-credit cycle is not
 * reconciled into lines at all). The demand line is capped at the printed total so a demand
 * charge that rounds above the total (or a total that is mostly the demand charge) can never
 * emit a line exceeding the bill; demand + energy therefore always sum to EXACTLY the total.
 */
function buildLineItems(
  summary: NormalizedSummary,
  printedTotalCents: number,
  cycleKwh: number | null,
): {
  kind: string;
  label: string | null;
  amountCents: number;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
}[] {
  // Cap demand at the printed total (and floor at 0) so a demand figure larger than the
  // (rounding-noisy) total cannot mint a line exceeding the bill, and a NEM-credit summary's
  // negative demand figure cannot mint a negative line.
  const demandCents = Math.min(
    printedTotalCents,
    summary.demandChargeUsd != null ? Math.max(0, centsFromDollars(summary.demandChargeUsd)) : 0,
  );
  // Energy is the remainder; with demand capped at the total it is always >= 0, and the two
  // lines reconcile to printedTotalCents exactly.
  const energyCents = Math.max(0, printedTotalCents - demandCents);
  const items: {
    kind: string;
    label: string | null;
    amountCents: number;
    quantity: number | null;
    unit: string | null;
    rate: number | null;
  }[] = [];
  if (energyCents > 0) {
    items.push({
      kind: "other",
      label: "Energy",
      amountCents: energyCents,
      quantity: cycleKwh != null && cycleKwh > 0 ? cycleKwh : null,
      unit: "kWh",
      rate: null,
    });
  }
  if (demandCents > 0) {
    items.push({
      kind: "demand",
      label: "Demand",
      amountCents: demandCents,
      quantity: null,
      unit: "kW",
      rate: null,
    });
  }
  return items;
}

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
 * Land ONE normalized electric meter onto `farmId` inside its own transaction:
 * - the Pump (matched by stable service ID; rateSchedule, location, meterSerial, and
 *   account link refreshed from the feed, human name preserved),
 * - its BillingPeriods (one per cycle, with the derived max-demand peak AND the
 *   reconciled money fields the dashboard reads: printedTotalCents, cycleClose, and
 *   the demand/energy BillingLineItems that reconcile to it), and
 * - its 15-minute UsageIntervals (replaced within the imported window, chunked).
 *
 * Commits per meter (not one farm-wide transaction) so a single meter's failure cannot
 * roll the WHOLE import back, and so the interactive-transaction ceiling only ever has
 * to cover one meter's writes. Returns whether the pump was created vs updated, and how
 * many intervals/periods landed, for the batch tally.
 */
async function importOneMeter(
  prisma: PrismaClient,
  farmId: string,
  source: string,
  m: NormalizedMeter,
): Promise<{ created: boolean; intervals: number; billingPeriods: number }> {
  return prisma.$transaction(async (tx) => {
    const accountId = await resolveAccountId(tx, farmId, m.accountNumber);

    const existing = await tx.pump.findUnique({
      where: { farmId_serviceId: { farmId, serviceId: m.serviceId } },
    });

    // A meter whose cycles carry a printed total reads as a reconciled account, exactly
    // like the Batth seed and the bill-PDF extractor: the dashboard money view gates on
    // Pump.coverageState === "reconciled", so without this a real Green Button/UtilityAPI
    // farm renders an empty money dashboard. Stays "no_bill" when no cycle has a total.
    const hasBilledTotal = m.summaries.some((s) => s.totalBillUsd != null);

    const pump = await tx.pump.upsert({
      where: { farmId_serviceId: { farmId, serviceId: m.serviceId } },
      update: {
        // `?? undefined` leaves a column untouched when the feed lacks the value.
        rateSchedule: m.tariff ?? undefined,
        location: m.address ?? undefined,
        meterSerial: m.meterSerial ?? undefined,
        accountId: accountId ?? undefined,
        // Only ever promotes coverage on a re-import; never demotes a meter that a
        // later, richer source (a scanned bill) already reconciled.
        ...(hasBilledTotal ? { coverageState: "reconciled" } : {}),
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
        coverageState: hasBilledTotal ? "reconciled" : "no_bill",
      },
    });

    // Demand and consumption read the IMPORT (delivered) stream only: a NEM meter
    // also carries export (received) intervals at the same timestamps, and counting
    // those would corrupt both the max-demand peak and the cycle's metered kWh.
    const importIntervals = m.intervals.filter((r) => (r.direction ?? "import") === "import");

    // One BillingPeriod per cycle, carrying the derived peak that sets the charge AND
    // the reconciled money fields. Replace the period's line items on each upsert so a
    // re-import does not accrete duplicate lines.
    let billingPeriods = 0;
    for (const summary of m.summaries) {
      const peak = maxDemandInWindow(importIntervals, summary.start, summary.close);
      // Total cycle energy, summed from the real metered intervals in the window.
      // Stays null for summary-only meters (no interval history to sum), which is
      // the honest state: fleet usage reads what is actually metered.
      const cycleKwh = sumKwhInWindow(importIntervals, summary.start, summary.close);
      // printedTotalCents is the integer-cents canonical total the table and KPI strip
      // read (AR-6); derive it from the summary's billed dollars. cycleClose mirrors the
      // source period end (the Calendar lens reads it), the same choice the seed makes.
      const printedTotalCents =
        summary.totalBillUsd != null ? centsFromDollars(summary.totalBillUsd) : null;
      const close = new Date(summary.close);
      const data = {
        tariff: summary.tariff,
        close,
        cycleClose: close,
        printedTotalCents,
        demandChargeUsd: summary.demandChargeUsd,
        totalBillUsd: summary.totalBillUsd,
        totalKwh: cycleKwh,
        peakKw: peak?.kw ?? null,
        peakAt: peak ? new Date(peak.at) : null,
        source,
      };
      const period = await tx.billingPeriod.upsert({
        where: { pumpId_start: { pumpId: pump.id, start: new Date(summary.start) } },
        update: data,
        create: { pumpId: pump.id, start: new Date(summary.start), ...data },
      });
      // The per-line-item breakdown that reconciles to printedTotalCents (the money
      // view sums the demand lines, the table/chart read them). Replace then recreate so
      // a re-import is idempotent. Only a cycle with a POSITIVE printed total gets lines:
      // a $0 or net-credit (NEM) cycle has no charges to reconcile, so minting a demand
      // line against it would exceed the (zero/negative) total and never reconcile.
      await tx.billingLineItem.deleteMany({ where: { billingPeriodId: period.id } });
      if (printedTotalCents != null && printedTotalCents > 0) {
        const lineItems = buildLineItems(summary, printedTotalCents, cycleKwh);
        if (lineItems.length > 0) {
          await tx.billingLineItem.createMany({
            data: lineItems.map((li) => ({ billingPeriodId: period.id, ...li })),
          });
        }
      }
      billingPeriods += 1;
    }

    // Replace intervals within the imported window so re-imports are idempotent
    // without dropping any history outside this feed's span. Chunk the insert so a
    // high-history meter does not exceed Postgres's bind-parameter cap in one statement.
    let intervals = 0;
    if (m.intervals.length > 0) {
<<<<<<< HEAD
      // Find the window min/max in a single pass. A 36-month historical pull is ~100k+
      // intervals per meter; `Math.min(...array)` / `Math.max(...array)` spread that many
      // arguments onto the call stack and throw RangeError (max call-stack/arg count), so a
      // real multi-year import would abort the meter. A reduce-style loop has no such ceiling.
      let minMs = Infinity;
      let maxMs = -Infinity;
      for (const r of m.intervals) {
        const t = new Date(r.start).getTime();
        if (t < minMs) minMs = t;
        if (t > maxMs) maxMs = t;
      }
      const min = new Date(minMs);
      const max = new Date(maxMs);
=======
      // Span the imported window in a single pass (see intervalSpan): replacing intervals only
      // within [min, max] keeps the re-import idempotent without dropping history outside this
      // feed. The createMany below is already chunked for the bind-parameter cap.
      const { min, max } = intervalSpan(m.intervals);
>>>>>>> integration/all-24h
      await tx.usageInterval.deleteMany({
        where: { pumpId: pump.id, start: { gte: min, lte: max } },
      });
      const rows = m.intervals.map((r) => ({
        pumpId: pump.id,
        start: new Date(r.start),
        durationSec: r.durationSec,
        kWh: r.kWh,
        // Persist both streams for a NEM meter; the 3-part unique key keeps the
        // import and export readings at the same timestamp distinct. Defaults keep
        // the existing ESPI/Bayou paths (no per-interval direction/TOU) unchanged.
        direction: r.direction ?? "import",
        touCode: r.touCode ?? null,
      }));
      for (let i = 0; i < rows.length; i += INTERVAL_CHUNK) {
        await tx.usageInterval.createMany({ data: rows.slice(i, i + INTERVAL_CHUNK) });
      }
      intervals = m.intervals.length;
    }

    return { created: existing === null, intervals, billingPeriods };
  }, METER_TX_OPTIONS);
}

/**
 * Upsert each normalized meter onto `farmId`, committing PER METER so one meter's failure
 * cannot roll the whole import back (the live ingestion's first run on a real ~183-meter
 * farm must not be all-or-nothing). Each meter lands its Pump, its BillingPeriods with the
 * reconciled money fields, and its 15-minute UsageIntervals (chunked). A meter whose commit
 * throws is logged, counted in `metersFailed`, and skipped, the batch continues.
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
    metersFailed: 0,
  };

  for (const m of electric) {
    try {
      const landed = await importOneMeter(prisma, farmId, source, m);
      if (landed.created) result.pumpsCreated += 1;
      else result.pumpsUpdated += 1;
      result.intervals += landed.intervals;
      result.billingPeriods += landed.billingPeriods;
    } catch (err) {
      // One meter failing must never abort the batch: log it (service id only, never
      // grower data) and continue so the rest of the farm still lands.
      result.metersFailed += 1;
      console.error(
        `importMeters: meter ${m.serviceId} failed and was skipped`,
        err instanceof Error ? err.message : err,
      );
    }
  }

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

export type ImportDownloadMyDataOptions = {
  /** Raw file contents: a Download My Data CSV (usual) or Green Button XML. */
  content: string;
  farmId: string;
  /** Force the parser when the format is not obvious; sniffed by default. */
  format?: "csv" | "xml";
};

/**
 * Normalize a PG&E Download My Data / Share My Data usage export (CSV or Green Button
 * XML) and land it. Usage-only: each meter lands its 15-minute UsageIntervals (import
 * and, for solar meters, export streams) and stays coverageState "no_bill" until a
 * scanned bill reconciles dollars. Idempotent: a re-pull (the daily subscription's
 * corrections) overwrites the same window.
 */
export async function importDownloadMyData(
  prisma: PrismaClient,
  { content, farmId, format }: ImportDownloadMyDataOptions,
): Promise<ImportResult> {
  return importMeters(prisma, {
    meters: normalizeDownloadMyData(content, { format }),
    farmId,
    source: "download_my_data",
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
