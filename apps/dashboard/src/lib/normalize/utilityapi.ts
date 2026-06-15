// UtilityAPI v2 -> NormalizedMeter (pure). UtilityAPI hands us two things per pull:
//  - a Green Button (ESPI XML) export per meter, which carries the full interval +
//    billing history, and
//  - a native /meters JSON body, which carries the identity the standard ESPI feed
//    drops: the physical meter serial and the PG&E account number (and gas meters).
//
// So this mapper is a thin HYBRID, not a second parser: it runs the existing, tested
// normalizeEspi over the Green Button XML (zero new interval/billing/demand math) and
// then ENRICHES each meter's accountNumber/meterSerial from the JSON, keyed by the
// stable service id. Meters present only in the JSON (e.g. gas, or an electric meter
// whose XML was not pulled) are carried with empty usage so counts and the importer's
// account graph stay complete. Identity follows the data model: serviceId <-
// base.service_identifier (the upsert + reconciliation key), meterSerial <-
// base.meter_numbers[0] (churns on meter swap).

import { normalizeEspi } from "./espi";
import type { Fuel, NormalizedMeter } from "./types";

/** A UtilityAPI pull: the native /meters JSON plus one or more Green Button XML blobs. */
export type UtilityApiResponses = {
  /** GET /api/v2/meters body (unknown until guarded). The identity + account feed. */
  meters: unknown;
  /** Per-meter Green Button (ESPI XML) exports; the interval + billing feed. */
  greenButtonXml: string | string[];
};

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
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** PG&E commodity from service_class. Anything naming gas is gas; everything else
 * (electric, solar, the default) is electric, the only fuel the engine optimizes. */
function asFuel(serviceClass: unknown): Fuel {
  const text = asText(serviceClass)?.toLowerCase() ?? "";
  return text.includes("gas") ? "gas" : "electric";
}

// --- meter metadata off the native JSON -----------------------------------------

type MeterMeta = {
  serviceId: string;
  meterSerial: string | null;
  accountNumber: string | null;
  fuel: Fuel;
  tariff: string | null;
  address: string | null;
};

/** The base block carries the identity; service_address may be a string or an object. */
function flattenAddress(value: unknown): string | null {
  const direct = asText(value);
  if (direct) return direct;
  const rec = asRecord(value);
  if (!rec) return null;
  const stateZip = [asText(rec.state), asText(rec.zip ?? rec.postal_code)]
    .filter((p): p is string => !!p)
    .join(" ");
  const segments = [asText(rec.street ?? rec.line_1), asText(rec.city), stateZip].filter(
    (s): s is string => !!s,
  );
  return segments.length > 0 ? segments.join(", ") : null;
}

function metaFromMeter(meter: Record<string, unknown>): MeterMeta | null {
  const base = asRecord(meter.base) ?? meter;
  const serviceId = asText(base.service_identifier);
  if (!serviceId) return null;
  const meterNumber = asText(asArray(base.meter_numbers)[0]) ?? asText(base.meter_numbers);
  return {
    serviceId,
    meterSerial: meterNumber,
    accountNumber: asText(base.billing_account),
    fuel: asFuel(base.service_class),
    tariff: asText(base.service_tariff),
    address: flattenAddress(base.service_address),
  };
}

/** Build serviceId -> meta from the /meters body, in document order. */
function metaByServiceId(metersJson: unknown): Map<string, MeterMeta> {
  const byId = new Map<string, MeterMeta>();
  const body = asRecord(metersJson);
  for (const meter of asArray(body?.meters)) {
    const rec = asRecord(meter);
    if (!rec) continue;
    const meta = metaFromMeter(rec);
    if (meta && !byId.has(meta.serviceId)) byId.set(meta.serviceId, meta);
  }
  return byId;
}

// --- entry point ----------------------------------------------------------------

/**
 * Map a UtilityAPI pull to the normalized meter shape. Runs normalizeEspi over the
 * Green Button XML for the full interval/billing fidelity, enriches each meter's
 * account number + physical serial from the native JSON, then appends any JSON-only
 * meters (gas, or electric meters without an XML blob) with empty usage so the account
 * graph and the gas count stay complete. One entry per meter, electric first in XML
 * order, then any JSON-only meters in document order.
 */
export function normalizeUtilityApi({
  meters,
  greenButtonXml,
}: UtilityApiResponses): NormalizedMeter[] {
  const xmls = Array.isArray(greenButtonXml) ? greenButtonXml : [greenButtonXml];
  const meta = metaByServiceId(meters);

  const result: NormalizedMeter[] = [];
  const seen = new Set<string>();

  // Green Button meters: full usage from ESPI, identity enriched from the JSON.
  for (const xml of xmls) {
    if (!xml) continue;
    for (const m of normalizeEspi(xml)) {
      const enrich = meta.get(m.serviceId);
      seen.add(m.serviceId);
      result.push({
        ...m,
        accountNumber: enrich?.accountNumber ?? m.accountNumber,
        meterSerial: enrich?.meterSerial ?? m.meterSerial,
        tariff: m.tariff ?? enrich?.tariff ?? null,
        address: m.address ?? enrich?.address ?? null,
      });
    }
  }

  // JSON-only meters (gas, or any meter without a Green Button blob): identity only.
  for (const m of meta.values()) {
    if (seen.has(m.serviceId)) continue;
    result.push({
      serviceId: m.serviceId,
      meterSerial: m.meterSerial,
      accountNumber: m.accountNumber,
      fuel: m.fuel,
      tariff: m.tariff,
      address: m.address,
      intervals: [],
      summaries: [],
    });
  }

  return result;
}

/**
 * Count distinct accounts and meters-by-fuel straight off the native /meters JSON, for
 * the onboarding reveal before the (slower) Green Button blobs are fetched. Mirrors
 * countMeters in farm.ts but reads the raw body so the reveal can show account + meter
 * totals the moment authorizations land.
 */
export function countUtilityApiMeters(metersJson: unknown): {
  accounts: number;
  electricMeters: number;
  gasMeters: number;
} {
  const metas = [...metaByServiceId(metersJson).values()];
  const accounts = new Set(
    metas.map((m) => m.accountNumber).filter((a): a is string => a !== null),
  );
  return {
    accounts: accounts.size,
    electricMeters: metas.filter((m) => m.fuel === "electric").length,
    gasMeters: metas.filter((m) => m.fuel === "gas").length,
  };
}
