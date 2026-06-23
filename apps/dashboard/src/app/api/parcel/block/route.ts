import { ParcelLookupError } from "@/lib/parcel";
import { ingestBlockByApn, ingestBlockByPoint } from "@/lib/parcel/farm/ingest";

/**
 * Ingest one farm block from an APN or a coordinate: pull the real boundary, auto-enrich it, and
 * return a fully-built FarmParcel. Backs the "+ Add parcel" tool and the real "Connect your farm"
 * path. Node runtime (proj4 + external fetches server-side). Hits live county/enrichment services,
 * so it can take a couple of seconds; the page's seeded farm loads instantly from the fixture and
 * never depends on this.
 *
 * NOTE (abuse): like api/parcel, this is unauthenticated (it also backs the public Tour's add-parcel)
 * and one call fans out to several free public services (county GIS, DWR, USDA SDA). It only reads
 * public records, but add a per-IP rate limit / bot check before exposing it widely. Inputs are
 * bounded below so a single call can't be inflated into an oversized upstream request.
 */
export const runtime = "nodejs";

// An APN is a short alphanumeric token (e.g. "33803239S"); reject anything else before it reaches
// an upstream WHERE clause / request URL.
const APN_RE = /^[A-Za-z0-9-]{1,32}$/;

function todayPacific(): string {
  // The grower's calendar date (one timezone, like the rest of the dashboard), so relative dates
  // (lease expiry, task due) anchor correctly.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const today = todayPacific();

  try {
    if (typeof o.apn === "string" && o.apn.trim().length > 0) {
      const apn = o.apn.trim();
      if (!APN_RE.test(apn)) {
        return Response.json({ error: "invalid_apn" }, { status: 400 });
      }
      const block = await ingestBlockByApn(apn, today);
      return block ? Response.json(block) : Response.json({ error: "not_found" }, { status: 404 });
    }
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const block = await ingestBlockByPoint(lat, lng, today);
      return block ? Response.json(block) : Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ error: "invalid_point" }, { status: 400 });
  } catch (cause) {
    if (cause instanceof ParcelLookupError) {
      const status = cause.code === "invalid_point" ? 400 : cause.code === "out_of_coverage" ? 404 : 502;
      return Response.json({ error: cause.code }, { status });
    }
    return Response.json({ error: "ingest_failed" }, { status: 502 });
  }
}
