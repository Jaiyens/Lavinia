// Bayou v2 JSON -> NormalizedMeter (pure). Built against the real Speculoos pull in
// fixtures/bayou/ (see that README for the shape). The three responses play
// different roles:
// - customer:  account_numbers[].meters[] is the authoritative meter list. Each
//              meter carries its commodity (type), SA ID (service_number), tariff,
//              and address, and lives under an account number.
// - bills:     per-cycle summaries; bills[].meters[] splits a bill by meter id.
// - intervals: the 15-minute series, but meters[] there are keyed ONLY by id (the
//              serial) with no type/service_number, so we join back to the meter
//              meta by id.
//
// Identity follows CLAUDE.md / the data model: serviceId <- service_number (stable
// SA ID, the upsert + reconciliation key), meterSerial <- id (churns on meter swap).
// Units are normalized to the internal contract: money cents -> USD, energy Wh -> kWh.

import type { IntervalReading } from "@/lib/energy/types";
import type {
  Fuel,
  NormalizedMeter,
  NormalizedSummary,
} from "./types";

/** The three raw Bayou responses, already JSON-parsed (unknown until guarded). */
export type BayouResponses = {
  /** GET /api/v2/customers/{id} */
  customer: unknown;
  /** GET /api/v2/customers/{id}/bills */
  bills: unknown;
  /** GET /api/v2/customers/{id}/intervals */
  intervals: unknown;
};

const WH_PER_KWH = 1000;
const BAYOU_CENTS_PER_USD = 100;

// --- unknown-typed accessors (keep the mapper any-free) -------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normalize a Bayou timestamp ("YYYY-MM-DD" or full ISO) to a full ISO instant. */
function toIso(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function asFuel(value: unknown): Fuel | null {
  return value === "electric" || value === "gas" ? value : null;
}

function flattenAddress(address: unknown): string | null {
  const rec = asRecord(address);
  if (!rec) return null;
  const stateZip = [asText(rec.state), asText(rec.postal_code)]
    .filter((p): p is string => !!p)
    .join(" ");
  const segments = [
    asText(rec.line_1),
    asText(rec.line_2),
    asText(rec.city),
    stateZip,
  ].filter((s): s is string => !!s && s.trim() !== "");
  return segments.length > 0 ? segments.join(", ") : null;
}

// --- meter metadata (identity, fuel, tariff, address, account) ------------------

type MeterMeta = {
  serial: string; // meters[].id (churnable physical meter)
  serviceId: string; // additional_attributes.service_number (stable SA ID)
  fuel: Fuel;
  tariff: string | null;
  address: string | null;
  accountNumber: string | null;
};

/** First tariff name on a meter record (customer or bill meter shape). */
function firstTariff(meter: Record<string, unknown>): string | null {
  // customer meters carry tariffs[]; bill meters carry a single `tariff` string.
  const direct = asText(meter.tariff);
  if (direct) return direct;
  const first = asRecord(asArray(meter.tariffs)[0]);
  return first ? asText(first.tariff) : null;
}

function metaFromMeter(
  meter: Record<string, unknown>,
  accountNumber: string | null,
): MeterMeta | null {
  const serial = asText(meter.id);
  const fuel = asFuel(meter.type);
  if (!serial || !fuel) return null;
  const attrs = asRecord(meter.additional_attributes);
  return {
    serial,
    // Fall back to the serial only if the SA ID is genuinely absent, so identity
    // is never empty; in the real feed service_number is always present.
    serviceId: asText(attrs?.service_number) ?? serial,
    fuel,
    tariff: firstTariff(meter),
    address: flattenAddress(meter.address),
    accountNumber,
  };
}

/**
 * Build the meter-meta map keyed by serial id. customer.account_numbers[] is
 * authoritative (it carries the account number); bills[].meters[] backfills any
 * meter that only shows up on a bill.
 */
function buildMeterMeta(customer: unknown, bills: unknown): Map<string, MeterMeta> {
  const byId = new Map<string, MeterMeta>();

  const customerRec = asRecord(customer);
  for (const account of asArray(customerRec?.account_numbers)) {
    const acctRec = asRecord(account);
    const accountNumber = asText(acctRec?.id);
    for (const meter of asArray(acctRec?.meters)) {
      const rec = asRecord(meter);
      if (!rec) continue;
      const meta = metaFromMeter(rec, accountNumber);
      if (meta && !byId.has(meta.serial)) byId.set(meta.serial, meta);
    }
  }

  for (const bill of asArray(bills)) {
    const billRec = asRecord(bill);
    const accountNumber = asText(billRec?.account_number);
    for (const meter of asArray(billRec?.meters)) {
      const rec = asRecord(meter);
      if (!rec) continue;
      const meta = metaFromMeter(rec, accountNumber);
      if (meta && !byId.has(meta.serial)) byId.set(meta.serial, meta);
    }
  }

  return byId;
}

// --- intervals ------------------------------------------------------------------

const DEFAULT_DURATION_SEC = 900;

function durationSec(start: string, endRaw: unknown): number {
  const end = asText(endRaw);
  if (!end) return DEFAULT_DURATION_SEC;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return DEFAULT_DURATION_SEC;
  return Math.round((b - a) / 1000);
}

/** Electric kWh series for one meter's interval block. Gas meters yield none. */
function readingsForMeter(block: Record<string, unknown>, fuel: Fuel): IntervalReading[] {
  if (fuel !== "electric") return [];
  const readings: IntervalReading[] = [];
  for (const interval of asArray(block.intervals)) {
    const rec = asRecord(interval);
    if (!rec) continue;
    const start = toIso(rec.start);
    const wh = asNumber(rec.electricity_consumption); // null on gaps; 0 is a real read
    if (start === null || wh === null) continue;
    readings.push({
      start,
      durationSec: durationSec(start, rec.end),
      kWh: wh / WH_PER_KWH,
    });
  }
  readings.sort((a, b) => a.start.localeCompare(b.start));
  return readings;
}

/** Map serial id -> its interval block from the /intervals response. */
function intervalBlocksById(intervals: unknown): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  const rec = asRecord(intervals);
  for (const meter of asArray(rec?.meters)) {
    const meterRec = asRecord(meter);
    const id = asText(meterRec?.id);
    if (meterRec && id) byId.set(id, meterRec);
  }
  return byId;
}

// --- summaries (billing cycles) -------------------------------------------------

/**
 * Per-meter billing summaries from bills[]. Bayou gives no per-meter dollar split,
 * so we attribute the commodity-level amount (electricity_amount to electric meters,
 * gas_amount to gas), exact for the common one-meter-per-commodity account. Speculoos
 * is residential, so there are no demand line items (demandCharges stays empty).
 */
function summariesForSerial(bills: unknown, serial: string, fuel: Fuel): NormalizedSummary[] {
  const summaries: NormalizedSummary[] = [];
  for (const bill of asArray(bills)) {
    const billRec = asRecord(bill);
    if (!billRec) continue;
    const billMeter = asArray(billRec.meters)
      .map(asRecord)
      .find((m) => m && asText(m.id) === serial);
    if (!billMeter) continue;

    const start = toIso(billMeter.billing_period_from ?? billRec.billing_period_from);
    const close = toIso(billMeter.billing_period_to ?? billRec.billing_period_to);
    if (start === null || close === null) continue;

    const amountCents = asNumber(
      fuel === "gas" ? billRec.gas_amount : billRec.electricity_amount,
    );
    summaries.push({
      start,
      close,
      tariff: firstTariff(billMeter),
      demandCharges: [],
      demandChargeUsd: null,
      totalBillUsd: amountCents === null ? null : amountCents / BAYOU_CENTS_PER_USD,
    });
  }
  summaries.sort((a, b) => a.start.localeCompare(b.start));
  return summaries;
}

// --- entry point ----------------------------------------------------------------

/**
 * Map a Bayou v2 pull (customer + bills + intervals) to the normalized meter shape,
 * one entry per meter in the customer's account list, in account/meter order. Gas
 * meters are included with fuel "gas" and no kWh series; the importer is what drops
 * them (electric-only v1).
 */
export function normalizeBayou({ customer, bills, intervals }: BayouResponses): NormalizedMeter[] {
  const meta = buildMeterMeta(customer, bills);
  const blocks = intervalBlocksById(intervals);

  const result: NormalizedMeter[] = [];
  for (const m of meta.values()) {
    const block = blocks.get(m.serial);
    result.push({
      serviceId: m.serviceId,
      meterSerial: m.serial,
      accountNumber: m.accountNumber,
      fuel: m.fuel,
      tariff: m.tariff,
      address: m.address,
      intervals: block ? readingsForMeter(block, m.fuel) : [],
      summaries: summariesForSerial(bills, m.serial, m.fuel),
    });
  }
  return result;
}
