// The grower's master meter list -> normalized inventory rows. A big operation keeps
// its real source of truth in a spreadsheet (every meter, the account and legal entity
// it bills under, its rate, serial code, location, GPM, solar/NEM). PG&E feeds carry
// only a slice of this, so importing the sheet is how the whole farm becomes legible at
// once. This mapper is pure: it takes CSV text and returns typed rows plus the headers
// it could not place, so the importer (DB edge) stays trivial and this stays testable.
//
// Header matching is forgiving on purpose: growers name columns however they like
// ("SA ID", "Service Agreement", "Acct #"...), so we normalize each header (lowercase,
// strip non-alphanumerics) and match against alias sets. serviceId (the PG&E SA ID) is
// the stable identity the importer upserts on, the same key the ESPI/Bayou feeds use.

import { normalizeAccountNumber } from "@/lib/normalize/sa-id";
import type { PumpStatus } from "@/lib/recommendations/types";
import { parseCsv } from "./parse";

/** One meter from the master list, normalized to the data model's fields. */
export type InventoryRow = {
  /** PG&E service-agreement id (SA ID). The upsert + reconciliation key. */
  serviceId: string | null;
  meterSerial: string | null;
  name: string | null;
  accountNumber: string | null;
  /** The legal entity exactly as printed on the sheet (the billing-name variant). */
  entityName: string | null;
  rateSchedule: string | null;
  /** Serial code that drives the meter-read / billing-cycle close (was billingSerial). */
  serialCode: string | null;
  /** PG&E rotating-outage block; kept strictly distinct from serialCode (the trap). */
  rotatingOutageBlock: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  gpm: number | null;
  horsepower: number | null;
  nemType: string | null;
  trueUpMonth: number | null;
  solarKw: number | null;
  /** The grower's "P0xx" Pump ID descriptor, distinct from the Pump Name. */
  growerPumpId: string | null;
  /** Legacy AG-4/AG-5 flag: explicit column if present, else derived from the rate. */
  isLegacy: boolean;
  /** Solar flag: explicit column if present, else derived from solar/NEM presence. */
  isSolar: boolean;
  /** Pump health (FR-17), coerced to the PumpStatus union; null when unreadable. */
  status: PumpStatus | null;
  /** Crop carried on the meter, verbatim text -> Crop by name. */
  cropName: string | null;
  /** NEM aggregation / array code(s); ";"-separated when a meter draws from >1 array. */
  nemaCode: string | null;
  /** "pump" | "non_pump" (office/shop/solar-only). */
  kind: "pump" | "non_pump";
  /** Ranch / served-block grouping this meter belongs to, linked by name. */
  blockName: string | null;
};

export type InventoryParse = {
  rows: InventoryRow[];
  /** Header cells we recognized, in the order they appear. */
  mappedColumns: string[];
  /** Header cells we could not place (ignored, surfaced so the grower can adjust). */
  unmappedColumns: string[];
};

/** Canonical field -> the normalized header spellings that map to it. */
const ALIASES: Record<keyof Omit<InventoryRow, "kind">, string[]> = {
  serviceId: ["serviceid", "said", "sa", "saidno", "serviceagreement", "serviceagreementid", "spid"],
  meterSerial: ["meter", "meterserial", "meternumber", "meterno", "badge", "badgenumber"],
  name: ["name", "pumpname", "metername", "label", "description", "well", "wellname"],
  accountNumber: ["account", "accountnumber", "accountno", "acct", "acctno", "pgeaccount", "fullacct", "fullaccount", "fullacctno"],
  entityName: ["entity", "legalentity", "company", "businessentity", "owner", "billingentity", "billingname", "billing"],
  rateSchedule: ["rate", "rateschedule", "tariff", "rateplan", "schedule", "activerateschedule", "currentrate"],
  serialCode: ["serialcode", "billingserial", "cyclecode", "billingcycle", "meterreadcode", "serial", "cycle"],
  rotatingOutageBlock: ["rotatingoutageblock", "outageblock", "rotatingblock", "outage"],
  location: ["location", "address", "serviceaddress", "where", "site"],
  latitude: ["lat", "latitude", "premlat"],
  longitude: ["lon", "lng", "long", "longitude", "premlong"],
  gpm: ["gpm", "gallonsperminute", "flow", "flowrate"],
  horsepower: ["hp", "horsepower"],
  nemType: ["nem", "nemtype", "netmetering", "nemprogram"],
  trueUpMonth: ["trueup", "trueupmonth", "trueupdate"],
  solarKw: ["solarkw", "solarsize", "arraykw", "nameplatekw"],
  growerPumpId: ["pumpid", "pumpno", "pumpiddescriptor", "pumpident"],
  isLegacy: ["legacy", "islegacy", "legacyflag"],
  isSolar: ["issolar", "solarflag", "hassolar"],
  status: ["status", "pumpstatus", "condition", "health", "wellstatus"],
  cropName: ["crop", "croptype", "commodity"],
  nemaCode: ["nema", "nemacode", "aggregation", "aggregationcode", "nemagroup", "arrayid"],
  blockName: ["block", "ranch", "field", "served", "servedblock", "servedblocks"],
};

const KIND_ALIASES = ["kind", "type", "metertype", "use", "category"];

// The grower's "Solar" column is NOT the explicit isSolar flag: its cells carry array
// codes ("4433") and nameplate strings ("1092kw"), neither of which deriveIsSolar's
// explicit branch recognizes. We read it separately and feed it into the solar SIGNALS
// (any non-empty value flags solar; a "kw" value also yields a nameplate solarKw), which
// catches the 16 rows that have a Solar cell but an empty NEMA aggregation column.
const SOLAR_COLUMN_ALIASES = ["solar"];

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanText(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function toNumber(v: string | undefined): number | null {
  const t = cleanText(v);
  if (t === null) return null;
  // tolerate "1,200", "$1,200", "12 gpm"
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Accept a month number (1-12) or a month name/abbreviation. */
function toMonth(v: string | undefined): number | null {
  const t = cleanText(v);
  if (t === null) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const lower = t.toLowerCase();
  const idx = MONTHS.findIndex((m) => m.startsWith(lower) || lower.startsWith(m.slice(0, 3)));
  return idx >= 0 ? idx + 1 : null;
}

/** A row whose kind column reads as a non-metering load (office, shop, solar). */
function toKind(v: string | undefined): "pump" | "non_pump" {
  const t = (v ?? "").toLowerCase();
  if (/non.?pump|office|shop|house|residence|meter only|solar only|building/.test(t)) {
    return "non_pump";
  }
  return "pump";
}

/**
 * Coerce a free-text Status cell to the PumpStatus union (FR-17 pump health).
 * Case- and separator-insensitive; anything unrecognized is null (never fabricated).
 * NOTE: Status is pump HEALTH, never the pump/non_pump kind - the two are distinct.
 */
export function toPumpStatus(v: string | undefined): PumpStatus | null {
  const t = (v ?? "").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (t === "GOOD") return "GOOD";
  if (t === "BAD") return "BAD";
  if (t === "OLD") return "OLD";
  if (t === "NEW WELL" || t === "NEW" || t === "NEWWELL") return "NEW WELL";
  return null;
}

const TRUTHY = new Set(["yes", "true", "1", "y", "legacy"]);
const FALSY = new Set(["no", "false", "0", "n"]);
const LEGACY_RATE = /^\s*AG-?\s*[45]/i;

/**
 * Legacy AG-4/AG-5 flag. An explicit Legacy column wins; otherwise it is derived
 * from the verbatim rate schedule (AG-4 / AG-5 family). Deriving the flag from the
 * stored rate is a classification of that rate, not inference of the rate itself -
 * the rate value is still stored exactly as read (AC4).
 */
export function deriveIsLegacy(
  rateSchedule: string | null,
  explicit: string | undefined,
): boolean {
  const e = (explicit ?? "").trim().toLowerCase();
  if (TRUTHY.has(e)) return true;
  if (FALSY.has(e)) return false;
  return rateSchedule != null && LEGACY_RATE.test(rateSchedule);
}

/**
 * Solar flag. An explicit Solar column wins; otherwise true when the row carries any
 * solar/NEM signal (nameplate kW, a NEM program, a NEMA aggregation code, or a value in
 * the grower's "Solar" column). Mirrors the Story 1.1 seed convention (isSolar driven by
 * solarKw presence). NOTE: a value in the master sheet's "Solar" column is a signal here,
 * not the `explicit` flag - its cells hold array codes/"1092kw", which the explicit branch
 * (TRUTHY / "solar") would not recognize.
 */
export function deriveIsSolar(
  explicit: string | undefined,
  signals: {
    solarKw: number | null;
    nemType: string | null;
    nemaCode: string | null;
    solarColumn?: boolean;
  },
): boolean {
  const e = (explicit ?? "").trim().toLowerCase();
  if (TRUTHY.has(e) || e === "solar") return true;
  if (FALSY.has(e)) return false;
  return (
    signals.solarKw != null ||
    signals.nemType != null ||
    signals.nemaCode != null ||
    signals.solarColumn === true
  );
}

/**
 * Parse the master meter list (CSV text) into normalized rows. The first non-empty line
 * is treated as the header. Rows with neither a service id nor a meter serial nor a name
 * are dropped (a blank or separator line); everything else maps by its filled columns.
 */
export function parseInventory(csv: string): InventoryParse {
  const grid = parseCsv(csv);
  if (grid.length === 0) {
    return { rows: [], mappedColumns: [], unmappedColumns: [] };
  }
  const header = grid[0]!;
  const normalized = header.map(normHeader);

  // Build column index -> canonical field (first alias match wins per column).
  const colField = new Map<number, keyof InventoryRow>();
  // The "Solar" column is matched separately (it feeds solar signals, not a row field).
  let solarCol: number | null = null;
  const mappedColumns: string[] = [];
  const unmappedColumns: string[] = [];

  header.forEach((raw, col) => {
    const key = normalized[col]!;
    let placed: keyof InventoryRow | null = null;
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(key)) {
        placed = field as keyof InventoryRow;
        break;
      }
    }
    if (!placed && KIND_ALIASES.includes(key)) placed = "kind";
    if (placed) {
      colField.set(col, placed);
      mappedColumns.push(raw.trim());
    } else if (SOLAR_COLUMN_ALIASES.includes(key)) {
      solarCol = col;
      mappedColumns.push(raw.trim());
    } else if (raw.trim() !== "") {
      unmappedColumns.push(raw.trim());
    }
  });

  const cellFor = (cells: string[], field: keyof InventoryRow): string | undefined => {
    for (const [col, f] of colField) if (f === field) return cells[col];
    return undefined;
  };

  const rows: InventoryRow[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r]!;
    const serviceId = cleanText(cellFor(cells, "serviceId"));
    const meterSerial = cleanText(cellFor(cells, "meterSerial"));
    const name = cleanText(cellFor(cells, "name"));
    // Skip a row with no way to identify a meter at all.
    if (!serviceId && !meterSerial && !name) continue;

    // Read the raw signals the derived flags depend on once, then derive.
    const rateSchedule = cleanText(cellFor(cells, "rateSchedule"));
    const nemType = cleanText(cellFor(cells, "nemType"));
    const nemaCode = cleanText(cellFor(cells, "nemaCode"));
    // The "Solar" column (when present) is a solar signal and may carry a nameplate kW
    // ("1092kw" -> 1092). Only pull a kW number from a cell that names "kw"; bare array
    // codes like "4433" or the literal "Solar" still flag solar without faking a size.
    const solarCell = solarCol !== null ? cleanText(cells[solarCol]) : null;
    const solarKw =
      toNumber(cellFor(cells, "solarKw")) ??
      (solarCell !== null && /kw/i.test(solarCell) ? toNumber(solarCell) : null);
    const hasSolarColumnSignal = solarCell !== null;

    rows.push({
      serviceId,
      meterSerial,
      name,
      accountNumber: normalizeAccountNumber(cellFor(cells, "accountNumber")),
      entityName: cleanText(cellFor(cells, "entityName")),
      rateSchedule,
      serialCode: cleanText(cellFor(cells, "serialCode")),
      rotatingOutageBlock: cleanText(cellFor(cells, "rotatingOutageBlock")),
      location: cleanText(cellFor(cells, "location")),
      latitude: toNumber(cellFor(cells, "latitude")),
      longitude: toNumber(cellFor(cells, "longitude")),
      gpm: toNumber(cellFor(cells, "gpm")),
      horsepower: toNumber(cellFor(cells, "horsepower")),
      nemType,
      trueUpMonth: toMonth(cellFor(cells, "trueUpMonth")),
      solarKw,
      growerPumpId: cleanText(cellFor(cells, "growerPumpId")),
      isLegacy: deriveIsLegacy(rateSchedule, cellFor(cells, "isLegacy")),
      isSolar: deriveIsSolar(cellFor(cells, "isSolar"), {
        solarKw,
        nemType,
        nemaCode,
        solarColumn: hasSolarColumnSignal,
      }),
      status: toPumpStatus(cellFor(cells, "status")),
      cropName: cleanText(cellFor(cells, "cropName")),
      nemaCode,
      kind: toKind(cellFor(cells, "kind")),
      blockName: cleanText(cellFor(cells, "blockName")),
    });
  }

  return { rows, mappedColumns, unmappedColumns };
}
