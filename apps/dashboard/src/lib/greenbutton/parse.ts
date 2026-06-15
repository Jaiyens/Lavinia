// ESPI / Green Button XML parser (pure). Turns a PG&E Share My Data feed into our
// model: per UsagePoint (service ID), the 15-minute interval series, the tariff,
// the per-cycle demand charge dollars, and the service address. No UI, no DB.
//
// Green Button is an Atom <feed> of <entry> elements, each wrapping one ESPI
// resource in <content>, linked by <link rel="self|up|related"> hrefs under
// .../UsagePoint/{serviceId}/MeterReading/{id}/... paths. We group resources by
// that path hierarchy. The cost/uom/demand conventions are documented in
// fixtures/greenbutton/README.md. Built to the fixed published schema, so this is
// unchanged when real Self-Access data flows later.

import { XMLParser } from "fast-xml-parser";
import type { IntervalReading } from "@/lib/energy/types";

/** A single demand-related charge line item read off a UsageSummary. */
export type DemandCharge = {
  note: string;
  usd: number;
};

/** One billing cycle's summary, as parsed from an ESPI UsageSummary. */
export type ParsedUsageSummary = {
  /** Billing period start, ISO 8601 UTC. */
  start: string;
  /** Billing period close (start + duration), ISO 8601 UTC. */
  close: string;
  /** Rate schedule from <tariffProfile>, e.g. "AG-C". */
  tariff: string | null;
  /** Every demand line item (AG-C has a max-demand and a summer-peak charge). */
  demandCharges: DemandCharge[];
  /** Sum of the demand line items; null when the summary carries none. */
  demandChargeUsd: number | null;
  /** Total bill for the period (billLastPeriod); null when absent. */
  totalBillUsd: number | null;
};

/** One UsagePoint (a PG&E service ID = one Pump) with its usage. */
export type ParsedUsagePoint = {
  serviceId: string;
  /** Convenience: the tariff from the first summary, if any. */
  tariff: string | null;
  /** Flattened ServiceLocation address, if present. */
  address: string | null;
  /** 15-minute readings, sorted by start. */
  intervals: IntervalReading[];
  /** Per-cycle summaries, sorted by start. */
  summaries: ParsedUsageSummary[];
};

const UOM_WH = 72; // ESPI unit-of-measure code for watt-hours
const ESPI_COST_SCALE = 100_000; // monetary fields are in 1/100,000 of the currency

// --- unknown-typed traversal helpers (keep the parser any-free) ----------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
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

// --- href helpers --------------------------------------------------------------

function selfHref(entry: Record<string, unknown>): string | null {
  for (const link of asArray(entry.link)) {
    const rec = asRecord(link);
    if (rec && rec["@_rel"] === "self") return asText(rec["@_href"]);
  }
  return null;
}

/** The service ID is the path segment right after /UsagePoint/. */
function usagePointId(href: string): string | null {
  return href.match(/\/UsagePoint\/([^/]+)/)?.[1] ?? null;
}

/** The MeterReading base path, shared by a ReadingType and its IntervalBlocks. */
function meterReadingBase(href: string): string | null {
  return href.match(/^(.*\/MeterReading\/[^/]+)/)?.[1] ?? null;
}

// --- value conversions ---------------------------------------------------------

/** ESPI energy value -> kWh, via uom (72 = Wh) and powerOfTenMultiplier. */
function toKwh(value: number, uom: number, mult: number): number {
  if (uom !== UOM_WH) {
    throw new Error(`Unsupported ESPI uom ${uom}; expected ${UOM_WH} (Wh)`);
  }
  return (value * 10 ** mult) / 1000;
}

function epochToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

function flattenAddress(serviceLocation: Record<string, unknown>): string | null {
  const main = asRecord(serviceLocation.mainAddress);
  if (!main) return null;
  const street = asRecord(main.streetDetail);
  const town = asRecord(main.townDetail);
  const line1 = [asText(street?.number), asText(street?.name)]
    .filter((p): p is string => !!p)
    .join(" ");
  const stateZip = [asText(town?.stateOrProvince), asText(main.postalCode)]
    .filter((p): p is string => !!p)
    .join(" ");
  const segments = [line1, asText(town?.name), stateZip].filter(
    (s): s is string => !!s,
  );
  return segments.length > 0 ? segments.join(", ") : null;
}

// --- internal accumulator ------------------------------------------------------

type ReadingType = { uom: number; mult: number };
type RawBlock = { base: string | null; readings: IntervalReadingRaw[] };
type IntervalReadingRaw = { startEpoch: number; durationSec: number; value: number };

type Accumulator = {
  serviceId: string;
  blocks: RawBlock[];
  fallbackReadingType: ReadingType | null;
  summaries: ParsedUsageSummary[];
  address: string | null;
};

function parseReadingType(rt: Record<string, unknown>): ReadingType {
  return {
    uom: asNumber(rt.uom) ?? UOM_WH,
    mult: asNumber(rt.powerOfTenMultiplier) ?? 0,
  };
}

function parseBlock(block: Record<string, unknown>, base: string | null): RawBlock {
  const readings: IntervalReadingRaw[] = [];
  for (const reading of asArray(block.IntervalReading)) {
    const rec = asRecord(reading);
    if (!rec) continue;
    const period = asRecord(rec.timePeriod);
    const startEpoch = asNumber(period?.start);
    const value = asNumber(rec.value);
    if (startEpoch === null || value === null) continue;
    readings.push({
      startEpoch,
      durationSec: asNumber(period?.duration) ?? 900,
      value,
    });
  }
  return { base, readings };
}

function parseSummary(summary: Record<string, unknown>): ParsedUsageSummary {
  const period = asRecord(summary.billingPeriod);
  const startEpoch = asNumber(period?.start) ?? 0;
  const durationSec = asNumber(period?.duration) ?? 0;

  const demandCharges: DemandCharge[] = [];
  for (const item of asArray(summary.costAdditionalDetailLastPeriod)) {
    const rec = asRecord(item);
    const note = asText(rec?.note);
    const amount = asNumber(rec?.amount);
    if (note && amount !== null && /demand/i.test(note)) {
      demandCharges.push({ note, usd: amount / ESPI_COST_SCALE });
    }
  }

  const bill = asNumber(summary.billLastPeriod);

  return {
    start: epochToIso(startEpoch),
    close: epochToIso(startEpoch + durationSec),
    tariff: asText(summary.tariffProfile),
    demandCharges,
    demandChargeUsd:
      demandCharges.length > 0
        ? demandCharges.reduce((sum, c) => sum + c.usd, 0)
        : null,
    totalBillUsd: bill === null ? null : bill / ESPI_COST_SCALE,
  };
}

/**
 * Parse a Green Button / ESPI feed into one entry per UsagePoint (service ID),
 * in document order. Throws on an unsupported unit of measure.
 */
export function parseGreenButton(xml: string): ParsedUsagePoint[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: true,
  });
  const doc = asRecord(parser.parse(xml));
  const feed = asRecord(doc?.feed);
  const entries = asArray(feed?.entry);

  const accumulators = new Map<string, Accumulator>();
  const readingTypeByBase = new Map<string, ReadingType>();

  const accFor = (serviceId: string): Accumulator => {
    let acc = accumulators.get(serviceId);
    if (!acc) {
      acc = {
        serviceId,
        blocks: [],
        fallbackReadingType: null,
        summaries: [],
        address: null,
      };
      accumulators.set(serviceId, acc);
    }
    return acc;
  };

  for (const entry of entries) {
    const entryRec = asRecord(entry);
    if (!entryRec) continue;
    const href = selfHref(entryRec);
    if (!href) continue;
    const serviceId = usagePointId(href);
    if (!serviceId) continue; // feed-level / non-usage resources (e.g. LocalTimeParameters)
    const content = asRecord(entryRec.content);
    if (!content) {
      accFor(serviceId); // a bare UsagePoint with no content still registers the service ID
      continue;
    }

    const readingType = asRecord(content.ReadingType);
    if (readingType) {
      const base = meterReadingBase(href);
      const parsed = parseReadingType(readingType);
      if (base) readingTypeByBase.set(base, parsed);
      const acc = accFor(serviceId);
      acc.fallbackReadingType ??= parsed;
      continue;
    }

    const block = asRecord(content.IntervalBlock);
    if (block) {
      accFor(serviceId).blocks.push(parseBlock(block, meterReadingBase(href)));
      continue;
    }

    const summary = asRecord(content.UsageSummary);
    if (summary) {
      accFor(serviceId).summaries.push(parseSummary(summary));
      continue;
    }

    const location = asRecord(content.ServiceLocation);
    if (location) {
      accFor(serviceId).address ??= flattenAddress(location);
      continue;
    }

    // UsagePoint or any other resource: just make sure the service ID is registered.
    accFor(serviceId);
  }

  const result: ParsedUsagePoint[] = [];
  for (const acc of accumulators.values()) {
    const intervals: IntervalReading[] = [];
    for (const block of acc.blocks) {
      const rt =
        (block.base ? readingTypeByBase.get(block.base) : undefined) ??
        acc.fallbackReadingType;
      if (!rt) {
        throw new Error(
          `No ReadingType for UsagePoint ${acc.serviceId}; cannot scale readings`,
        );
      }
      for (const raw of block.readings) {
        intervals.push({
          start: epochToIso(raw.startEpoch),
          durationSec: raw.durationSec,
          kWh: toKwh(raw.value, rt.uom, rt.mult),
        });
      }
    }
    intervals.sort((a, b) => a.start.localeCompare(b.start));
    const summaries = [...acc.summaries].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    result.push({
      serviceId: acc.serviceId,
      tariff: summaries[0]?.tariff ?? null,
      address: acc.address,
      intervals,
      summaries,
    });
  }
  return result;
}
