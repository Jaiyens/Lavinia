import type { PrismaClient } from "@prisma/client";
import { classifyFarmPumps, importInventory } from "@/lib/onboarding/farm";
import { importGreenButton } from "@/lib/greenbutton/import";
import { fetchGreenButton } from "@/lib/onboarding/source";
import { parseInventory } from "@/lib/spreadsheet/inventory";
import { geocodeAddress } from "@/lib/onboarding/geocode";
import { type BillScanResult, readBillPhoto } from "@/lib/onboarding/vision";
import {
  type ExtractLog,
  persistExtraction,
  runExtraction,
} from "@/lib/extract/import";
import { createGatewayReader, hasGatewayKey, type PageReader } from "@/lib/extract/reader";

// Story 5.2: add a data source to an EXISTING onboarding farm, and decide whether the
// farm yet has a real source. The connect step creates the farm once (at identify) and
// accumulates sources into it - so accounts are addable iteratively (the underlying
// importers upsert by SA ID, never duplicating).

/**
 * How the data backing a PG&E connection arrived (C4 provenance). Mirrors the documented
 * union on Connection.source (SQLite has no enums). Only "smd" is a true live Share-My-Data
 * authorization; the others make the farm legible without the grower signing an LOA, so the
 * post-value LOA-upgrade flow keys on this to tell "already authorized" from "bill-only".
 */
export type ConnectionSource = "smd" | "green_button" | "bill_upload" | "sample";

export const CONNECTION_SOURCE = {
  smd: "smd",
  greenButton: "green_button",
  billUpload: "bill_upload",
  sample: "sample",
} as const satisfies Record<string, ConnectionSource>;

/** A connection is SMD-authorized only when its provenance is a true live Share-My-Data pull. */
export function isSmdAuthorized(connection: { source: string | null }): boolean {
  return connection.source === CONNECTION_SOURCE.smd;
}

/**
 * Whether to offer the grower the LOA / Share-My-Data upgrade: the farm is already legible
 * (it has at least one active PG&E connection) but NONE of those connections is a true SMD
 * authorization (they are bill-upload / green-button / sample). An empty list returns false
 * (no connection yet -> onboarding handles it, not the upsell).
 */
export function farmNeedsLoaUpgrade(
  connections: ReadonlyArray<{ type: string; status: string; source: string | null }>,
): boolean {
  const pge = connections.filter((c) => c.type === "pge_smd" && c.status === "active");
  if (pge.length === 0) return false;
  return !pge.some(isSmdAuthorized);
}

/** What the in-progress farm has, by meter, for the >=1-real-source gate. */
export type FarmSourceSummary = {
  /** meters carrying PG&E usage intervals (a Green Button / Bayou pull). */
  metersWithUsage: number;
  /** meters carrying posted billing periods (an imported/extracted bill). */
  metersWithBilling: number;
  /** identity/inventory-only meters (a spreadsheet row, or a v1 bill scan that read only
   *  identity) with neither usage nor a posted bill yet. */
  inventoryOnlyMeters: number;
};

/**
 * A "real source" is PG&E usage or a posted bill - data you can actually chart and
 * reconcile. A meter list (spreadsheet) or a v1 identity-only bill scan is inventory, not
 * a real source, so it does NOT unlock confirm on its own (AC2). The predicate is pure and
 * structural: when real bill extraction (FR-2) lands posted billing periods, billing-only
 * farms pass automatically with no change here.
 */
export function hasRealSource(s: FarmSourceSummary): boolean {
  return s.metersWithUsage > 0 || s.metersWithBilling > 0;
}

/** Provenance strength: a stronger source is never downgraded to a weaker one. SMD (a real
 *  signed authorization) outranks any upload; sample is the weakest placeholder. */
const SOURCE_RANK: Record<ConnectionSource, number> = {
  sample: 0,
  bill_upload: 1,
  green_button: 1,
  smd: 2,
};

/**
 * Record how a farm's PG&E data arrived on its pge_smd connection(s) (C4 provenance),
 * never downgrading a stronger provenance: once a farm is truly SMD-authorized, adding a
 * bill later does not relabel it bill-only. Idempotent.
 */
export async function recordConnectionSource(
  prisma: PrismaClient,
  farmId: string,
  source: ConnectionSource,
): Promise<void> {
  const conns = await prisma.connection.findMany({
    where: { farmId, type: "pge_smd" },
    select: { id: true, source: true },
  });
  for (const c of conns) {
    const current = c.source as ConnectionSource | null;
    if (current && SOURCE_RANK[current] >= SOURCE_RANK[source]) continue;
    await prisma.connection.update({ where: { id: c.id }, data: { source } });
  }
}

/** Count the farm's meters by what data backs them (drives the connect-step gate). */
export async function summarizeFarmSources(
  prisma: PrismaClient,
  farmId: string,
): Promise<FarmSourceSummary> {
  const pumps = await prisma.pump.findMany({
    where: { farmId },
    select: { _count: { select: { intervals: true, billingPeriods: true } } },
  });
  let metersWithUsage = 0;
  let metersWithBilling = 0;
  let inventoryOnlyMeters = 0;
  for (const p of pumps) {
    if (p._count.intervals > 0) metersWithUsage += 1;
    else if (p._count.billingPeriods > 0) metersWithBilling += 1;
    else inventoryOnlyMeters += 1;
  }
  return { metersWithUsage, metersWithBilling, inventoryOnlyMeters };
}

/**
 * Connect PG&E authorization (the real-source path). v1 pulls the committed sample Green
 * Button feed via the stubbed `fetchGreenButton` (zero external calls); prod swaps that
 * seam for the real Share My Data OAuth pull. Imports into the existing farm and
 * classifies, so it accumulates with anything already connected.
 */
export async function addPgeFeed(prisma: PrismaClient, farmId: string): Promise<void> {
  const xml = await fetchGreenButton();
  await importGreenButton(prisma, { xml, farmId });
  await classifyFarmPumps(prisma, farmId);
  // The Connect-PG&E path is the true Share-My-Data authorization (C4 provenance).
  await recordConnectionSource(prisma, farmId, CONNECTION_SOURCE.smd);
}

/** Add one or more uploaded Green Button (ESPI) XML exports to the existing farm.
 *  Returns the number of electric meters imported across the files, so the caller can tell
 *  the grower when a well-formed file carried no (electric) meters. */
export async function addGreenButtonFiles(
  prisma: PrismaClient,
  farmId: string,
  xmls: string[],
): Promise<number> {
  let imported = 0;
  for (const xml of xmls) {
    const result = await importGreenButton(prisma, { xml, farmId });
    imported += result.pumpsCreated + result.pumpsUpdated;
  }
  await classifyFarmPumps(prisma, farmId);
  // Uploaded Green Button usage is a real source but not a signed SMD authorization (C4).
  if (imported > 0) await recordConnectionSource(prisma, farmId, CONNECTION_SOURCE.greenButton);
  return imported;
}

/** Add the grower's master meter list (CSV) to the existing farm (inventory, not usage). */
export async function addSpreadsheet(
  prisma: PrismaClient,
  farmId: string,
  csv: string,
): Promise<number> {
  const { rows } = parseInventory(csv);
  const result = await importInventory(prisma, { rows, farmId });
  return result.pumpsCreated + result.pumpsUpdated;
}

/**
 * Add an IDENTITY-ONLY meter read from a bill (the offline fallback). Reads only the printed
 * identity (account, service id, rate, cycle code, address) via the stubbed vision seam, so
 * it lands an inventory meter (pinned from the address so the grower never types it - AC3) but
 * NO billing figures. Used in dev/CI (no AI Gateway key) so the flow walks with zero external
 * calls; the real-figures path is `addBillPdf`. An identity-only bill is not a real source, so
 * it does not unlock confirm on its own (hasRealSource), but its provenance is still recorded.
 */
export async function addBill(
  prisma: PrismaClient,
  farmId: string,
  scan: BillScanResult,
): Promise<void> {
  const pin = geocodeAddress(scan.address);
  await prisma.pump.create({
    data: {
      farmId,
      name: scan.accountName?.trim() || scan.serviceId?.trim() || "Meter from bill",
      serviceId: scan.serviceId?.trim() || null,
      meterSerial: scan.meterSerial?.trim() || null,
      rateSchedule: scan.rateSchedule?.trim() || null,
      billingSerial: scan.billingSerial?.trim() || null,
      location: scan.address?.trim() || null,
      kind: "pump",
      powerSource: "electric",
      ...(pin ? { latitude: pin.lat, longitude: pin.lng } : {}),
    },
  });
  await recordConnectionSource(prisma, farmId, CONNECTION_SOURCE.billUpload);
}

/** The reader pair `addBillPdf` runs the extraction over (injected so it is testable with a
 *  fake reader, and so the AI Gateway is constructed only by the action that has the key). */
export type BillReaders = {
  /** Primary (cheaper) reader, e.g. Sonnet. */
  reader: PageReader;
  /** Escalation reader, e.g. Opus, used to re-extract a charge-detail page that fails the gate. */
  escalateReader?: PageReader;
  log?: ExtractLog;
};

export type BillImportResult = {
  /** Meters that gained at least one reconciled billing period (a genuine real source). */
  billedMeters: number;
  /** Pages/SAs the gate could not prove and withheld as needs_review (never wrong numbers). */
  needsReview: number;
};

/**
 * Add a REAL bill (C3 / FR-2): run the full scanned-bill extraction pipeline over the uploaded
 * PDF and attach the reconciled BillingPeriods to the EXISTING onboarding farm (joined on SA
 * ID), so an uploaded bill becomes a real source carrying figures - not an identity stub.
 * Only figures that reconcile to the printed total to the cent are persisted; the rest are
 * withheld as needs_review (NFR-4). The AI reader is injected (the action builds the Gateway
 * reader when its key is present; tests pass a fake), keeping this edge testable and the
 * library free of env/secret reads.
 */
export async function addBillPdf(
  prisma: PrismaClient,
  farmId: string,
  bytes: Uint8Array,
  readers: BillReaders,
): Promise<BillImportResult> {
  const result = await runExtraction(bytes, {
    reader: readers.reader,
    escalateReader: readers.escalateReader,
    log: readers.log,
  });
  await persistExtraction(result, prisma, {
    farmId,
    farmName: "", // ignored: farmId is given, so the existing farm's name is preserved.
    accountNumber: result.accountNumber ?? "bill-upload",
  });
  await classifyFarmPumps(prisma, farmId);
  // A bill is a real source but not a signed SMD authorization (C4 provenance).
  await recordConnectionSource(prisma, farmId, CONNECTION_SOURCE.billUpload);
  return { billedMeters: result.reconciledCount, needsReview: result.needsReview.length };
}

/**
 * Onboarding bill-upload entry point (the screen calls THIS, never the extract layer - the
 * raw-source boundary stays behind lib/onboarding). With an AI Gateway key, run real
 * extraction (Sonnet first, Opus on a gate failure) so the bill lands reconciled figures;
 * without one (dev/CI), fall back to reading only the printed identity so the flow walks
 * offline with zero external calls. Returns whether the bill became a real source.
 */
export async function importBillUpload(
  prisma: PrismaClient,
  farmId: string,
  bytes: Uint8Array,
): Promise<{ realFigures: boolean }> {
  if (hasGatewayKey()) {
    const result = await addBillPdf(prisma, farmId, bytes, {
      reader: createGatewayReader("anthropic/claude-sonnet-4-6"),
      escalateReader: createGatewayReader("anthropic/claude-opus-4-8"),
    });
    return { realFigures: result.billedMeters > 0 };
  }
  // Offline fallback: identity only, no figures.
  const scan = await readBillPhoto({ bytes });
  await addBill(prisma, farmId, scan);
  return { realFigures: false };
}
