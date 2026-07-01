// Deterministic parser: a getDeliveries.php payload -> typed CropDelivery rows. PURE (no DB, no clock,
// no AI): the portal returns structured JSON, so pounds are read and coerced to integers here, never
// inferred by a model. Extracted from the local loader (scripts/load-almond.ts) so the live Sandbox
// path and the local loader share ONE mapping and can never drift. The row's farmId is added by the
// tenant writer; this module produces the farm-agnostic content only.
//
// Every weight is whole pounds (money/poundage law). Coercion is forgiving of the portal's mixed
// number/string encodings but never fabricates: an unparseable weight becomes 0, a missing field
// becomes null / the explicit "Unknown" variety, never a guess.

/** One portal delivery row (getDeliveries.php), with the portal's loose number/string encodings. */
type RawDelivery = {
  loadId?: string | number;
  fieldTicketNumber?: string | number;
  deliveryDate?: string;
  field?: string | number;
  variety?: string;
  gross?: number | string;
  tare?: number | string;
  net?: number | string;
  mediaId?: string | number;
};

/** A parsed delivery, ready for the tenant writer to stamp farmId onto and upsert into CropDelivery. */
export type DeliveryRow = {
  hullerId: number;
  huller: string;
  cropYear: number;
  loadId: string;
  fieldTicket: string | null;
  field: string | null;
  variety: string;
  grossLb: number;
  tareLb: number;
  netLb: number;
  /** The raw delivery date string from the portal (ISO-ish), or null; the writer coerces to a Date. */
  deliveryDate: string | null;
  mediaId: string | null;
  source: "ALMOND_LOGIC";
};

/** Coerce a portal weight to whole pounds. number -> rounded; string -> digits only -> rounded; else 0. */
export function toIntPounds(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  if (typeof v === "string") return Math.round(Number(v.replace(/[^0-9.-]/g, "")) || 0);
  return 0;
}

/** Trim a portal string field to a non-empty string, or null. */
function optionalString(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return null;
}

/**
 * Parse a getDeliveries.php payload into typed delivery rows for one (huller, cropYear). A non-array
 * payload (an error object, or an omitted response) yields [] — the caller decides whether that is a
 * source change; this parser never throws on shape. loadId defaults to "" (the writer's unique key
 * tolerates it), variety defaults to "Unknown" (mirrors the loader), and every weight is an integer.
 */
export function parseDeliveries(
  json: unknown,
  ctx: { hullerId: number; huller: string; cropYear: number },
): DeliveryRow[] {
  if (!Array.isArray(json)) return [];
  const rows: DeliveryRow[] = [];
  for (const raw of json) {
    if (raw === null || typeof raw !== "object") continue;
    const d = raw as RawDelivery;
    rows.push({
      hullerId: ctx.hullerId,
      huller: ctx.huller,
      cropYear: ctx.cropYear,
      loadId: d.loadId != null ? String(d.loadId) : "",
      fieldTicket: optionalString(d.fieldTicketNumber),
      field: optionalString(d.field),
      variety: typeof d.variety === "string" && d.variety.trim() !== "" ? d.variety : "Unknown",
      grossLb: toIntPounds(d.gross),
      tareLb: toIntPounds(d.tare),
      netLb: toIntPounds(d.net),
      deliveryDate: optionalString(d.deliveryDate),
      mediaId: optionalString(d.mediaId),
      source: "ALMOND_LOGIC",
    });
  }
  return rows;
}
