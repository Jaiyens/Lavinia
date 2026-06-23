// The generic Esri parcel adapter. MOST California counties expose parcels through an Esri
// ArcGIS REST FeatureServer/MapServer, and the point-in-polygon query shape is IDENTICAL across
// all of them, so the per-county work collapses to a config object (layer URL + APN field names
// + bbox). A county WITHOUT an Esri service writes its own CountyParcelAdapter instead; this is
// just the common case factored out.
//
// THE QUERY (works for any Esri parcel layer):
//   {layerUrl}/query?geometry={lng},{lat}&geometryType=esriGeometryPoint&inSR=4326
//     &spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=geojson
// CRITICAL: Esri point geometry is x=LONGITUDE, y=LATITUDE (NOT lat,lng). Swapping them is the
// #1 silent bug — the query still "works" but returns nothing or the wrong parcel. inSR=4326
// declares the point is WGS84; f=geojson returns standard GeoJSON (always WGS84 lng/lat).

import { z } from "zod";
import {
  ParcelLookupError,
  type BBox,
  type BBoxParcel,
  type BBoxResult,
  type CountyParcelAdapter,
  type LatLng,
  type ParcelFields,
  type ParcelGeometry,
  type ParcelMatch,
  type Position,
  type RawParcelHit,
} from "./types";
import { distanceMetersPointToGeometry } from "./geo";

export type EsriParcelAdapterConfig = {
  county: string;
  bbox: BBox;
  /** The layer endpoint, e.g. ".../FeatureServer/0" or ".../MapServer/3". */
  layerUrl: string;
  /** Candidate APN field names, in priority order. First one present and non-empty wins. */
  apnFields: string[];
  /** Human-facing provenance (the county's distribution page or portal). */
  sourcePage: string;
  /** Road-gap fallback radius in meters (default 25). */
  bufferMeters?: number;
  /** Per-request timeout in ms (default 12000). */
  timeoutMs?: number;
  /** The layer's maxRecordCount, used to infer truncation when the source omits the flag (default 2000). */
  maxRecordCount?: number;
  /** Injectable fetch, for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

// --- GeoJSON response parsing (no `any`; the network is untrusted) ----------------------------

const positionSchema = z.array(z.number()).min(2);
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(positionSchema)),
});
const multiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(positionSchema))),
});
const geometrySchema = z.union([polygonSchema, multiPolygonSchema]);
const propertiesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
const featureSchema = z.object({
  // RFC 7946 requires both members present-but-null when empty, and Esri's f=geojson emits them;
  // tolerate a non-conformant proxy that omits a key entirely (downstream is null/absence-safe).
  geometry: z.union([geometrySchema, z.null()]).optional(),
  properties: z.union([propertiesSchema, z.null()]).optional(),
});
const featureCollectionSchema = z.object({
  features: z.array(featureSchema),
  // Esri's f=geojson adds this non-standard member when the query hit maxRecordCount.
  exceededTransferLimit: z.boolean().optional(),
});
// Esri returns HTTP 200 with this body on a query error (bad field, throttle, etc.).
const esriErrorSchema = z.object({
  error: z.object({ code: z.number().optional(), message: z.string().optional() }),
});

type ParsedGeometry = z.infer<typeof geometrySchema>;

/** Drop any Z/M ordinates: keep [lng, lat] only, matching our Position type. */
function toPosition(p: number[]): Position {
  return [p[0]!, p[1]!];
}

function normalizeGeometry(geometry: ParsedGeometry): ParcelGeometry {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => ring.map(toPosition)) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(toPosition))),
  };
}

/** First configured APN field that carries a usable value, stringified and trimmed. */
function pickApn(fields: ParcelFields, apnFields: string[]): string | null {
  for (const name of apnFields) {
    const value = fields[name];
    // Skip null/undefined and booleans (String(false) -> "false" is not an APN).
    if (value === null || value === undefined || typeof value === "boolean") continue;
    const text = String(value).trim();
    // Skip empties and the all-zero sentinel some assessor layers use for an un-APN'd parcel
    // (road / right-of-way / water): numeric 0 -> "0". Falling through reaches the next candidate
    // field, or returns null (a clean "no APN" that throws upstream, never a bogus "0").
    if (text.length === 0 || /^0+$/.test(text)) continue;
    return text;
  }
  return null;
}

function buildQueryUrl(layerUrl: string, point: LatLng, bufferMeters?: number): string {
  const params = new URLSearchParams({
    // x=lng, y=lat — the order Esri expects for a point.
    geometry: `${point.lng},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    f: "geojson",
  });
  if (bufferMeters != null) {
    params.set("distance", String(bufferMeters));
    params.set("units", "esriSRUnit_Meter");
  }
  return `${layerUrl}/query?${params.toString()}`;
}

type RawFeature = z.infer<typeof featureSchema>;
type RawCollection = z.infer<typeof featureCollectionSchema>;

async function queryCollection(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<RawCollection> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ParcelLookupError("upstream", `parcel service request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new ParcelLookupError("upstream", `parcel service returned HTTP ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ParcelLookupError("upstream", "parcel service returned non-JSON");
  }
  const asError = esriErrorSchema.safeParse(json);
  if (asError.success) {
    throw new ParcelLookupError("upstream", `parcel service error: ${asError.data.error.message ?? "unknown"}`);
  }
  const parsed = featureCollectionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ParcelLookupError("upstream", "parcel service returned an unexpected shape");
  }
  return parsed.data;
}

async function queryFeatures(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<RawFeature[]> {
  return (await queryCollection(url, fetchImpl, timeoutMs)).features;
}

/** Build the {layerUrl}/query URL for every parcel intersecting an envelope (viewport). */
function buildBboxQueryUrl(layerUrl: string, box: BBox, apnField: string): string {
  const params = new URLSearchParams({
    // Esri envelope order is xmin,ymin,xmax,ymax = minLng,minLat,maxLng,maxLat (x=lng, y=lat).
    geometry: `${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    // Just the county's APN field + boundary: the overlay needs id + geometry, not every attribute
    // (keeps payloads small). The field name varies per county (APN / ASMT / PARCELID / ...).
    outFields: apnField,
    returnGeometry: "true",
    f: "geojson",
  });
  return `${layerUrl}/query?${params.toString()}`;
}

/**
 * Build a CountyParcelAdapter backed by an Esri ArcGIS REST layer. Does exact point-in-polygon
 * first; on an empty result (the point fell on a road / right-of-way) it retries with a small
 * buffer and returns the NEAREST parcel, flagged `match: "nearest"` with the distance.
 */
export function createEsriParcelAdapter(config: EsriParcelAdapterConfig): CountyParcelAdapter {
  const bufferMeters = config.bufferMeters ?? 25;
  const timeoutMs = config.timeoutMs ?? 12_000;
  const maxRecordCount = config.maxRecordCount ?? 2000;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    county: config.county,
    bbox: config.bbox,
    async lookupByBbox(box: BBox): Promise<BBoxResult> {
      const collection = await queryCollection(
        buildBboxQueryUrl(config.layerUrl, box, config.apnFields[0] ?? "APN"),
        fetchImpl,
        timeoutMs,
      );
      const parcels: BBoxParcel[] = [];
      for (const feature of collection.features) {
        if (feature.geometry == null) continue; // skip null-geometry rows; don't throw on a bulk query
        const apn = pickApn(feature.properties ?? {}, config.apnFields);
        if (apn === null) continue; // skip un-APN'd parcels (roads / ROW) silently in bulk
        parcels.push({ apn, geometry: normalizeGeometry(feature.geometry) });
      }
      // Trust the source's flag; fall back to the count hitting the page limit (some servers omit it).
      const capped = collection.exceededTransferLimit === true || collection.features.length >= maxRecordCount;
      return { parcels, capped };
    },
    async lookupByPoint(point: LatLng): Promise<RawParcelHit | null> {
      // 1) Exact point-in-polygon.
      let features = await queryFeatures(buildQueryUrl(config.layerUrl, point), fetchImpl, timeoutMs);
      let match: ParcelMatch = "contains";

      // 2) Road-gap fallback: buffer the point, take the nearest parcel.
      if (features.length === 0) {
        features = await queryFeatures(
          buildQueryUrl(config.layerUrl, point, bufferMeters),
          fetchImpl,
          timeoutMs,
        );
        match = "nearest";
      }

      const withGeometry = features.filter(
        (f): f is RawFeature & { geometry: ParsedGeometry } => f.geometry != null,
      );
      if (withGeometry.length === 0) return null;

      let chosen = withGeometry[0]!;
      let distanceMeters: number | null = null;
      if (match === "nearest") {
        let best = Infinity;
        for (const feature of withGeometry) {
          const distance = distanceMetersPointToGeometry(point, normalizeGeometry(feature.geometry));
          if (distance < best) {
            best = distance;
            chosen = feature;
          }
        }
        distanceMeters = Number.isFinite(best) ? best : null;
      }

      const geometry = normalizeGeometry(chosen.geometry);
      const fields: ParcelFields = chosen.properties ?? {};
      const apn = pickApn(fields, config.apnFields);
      if (apn === null) {
        throw new ParcelLookupError(
          "upstream",
          `parcel has no APN in any of [${config.apnFields.join(", ")}]`,
        );
      }

      return { apn, geometry, sourceUrl: config.layerUrl, match, distanceMeters, fields };
    },
  };
}
