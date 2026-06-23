// Live ingestion: turn a coordinate or an APN into a fully-built FarmParcel by pulling the real
// boundary from the county engine and auto-enriching it, then generating the representative ops
// layer. This is the REAL "Connect your farm" path (a farmer enters their APNs; we pull geometry +
// enrich), and also backs the "+ Add parcel" tool. Server-only (hits external services).

import { polygonAcresAndCentroid } from "../geo";
import { lookupParcelByPoint } from "../lookup";
import { FRESNO_PARCEL_LAYER } from "../counties/fresno";
import { ParcelLookupError, type ParcelGeometry, type Position } from "../types";
import { enrichParcel } from "./enrich";
import { buildFarmParcel, type EngineParcel } from "./representative";
import type { FarmParcel } from "./types";

const round = (n: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

async function toBlock(base: EngineParcel, todayIso: string): Promise<FarmParcel> {
  const enrichment = await enrichParcel(base.centroid_lat, base.centroid_lon, {
    geometry: base.geometry,
    acres: base.gross_acres,
    county: base.county,
  });
  return buildFarmParcel(base, enrichment, 0, todayIso);
}

/** Add a block from a coordinate (reuses the public-records engine + its road-gap fallback). */
export async function ingestBlockByPoint(
  lat: number,
  lng: number,
  todayIso: string,
): Promise<FarmParcel | null> {
  const r = await lookupParcelByPoint(lat, lng);
  if (!r) return null;
  const base: EngineParcel = {
    apn: r.apn,
    county: r.county,
    geometry: r.geometry,
    centroid_lat: r.centroid_lat,
    centroid_lon: r.centroid_lon,
    source_url: r.source_url,
    gross_acres: r.parcel_acres,
  };
  return toBlock(base, todayIso);
}

// Minimal GeoJSON typing for the APN query response (the network is untrusted; no `any`).
type GjPolygon = { type: "Polygon"; coordinates: number[][][] };
type GjMultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };
type GjFeature = { properties: { APN?: string | null } | null; geometry: GjPolygon | GjMultiPolygon | null };
type GjFeatureCollection = { features?: GjFeature[] };

const pos = (p: number[]): Position => [p[0]!, p[1]!];
function normalize(g: GjPolygon | GjMultiPolygon): ParcelGeometry {
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map(pos)) };
  return { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map((r) => r.map(pos))) };
}

/**
 * Add a block by APN (what a farmer actually knows). Fresno-only for now; a county-dispatch by APN
 * format slots in later, exactly like the point dispatcher. Returns null if the APN isn't found.
 */
export async function ingestBlockByApn(apn: string, todayIso: string): Promise<FarmParcel | null> {
  const clean = apn.trim();
  if (!clean) return null;
  const params = new URLSearchParams({
    where: `UPPER(APN)='${clean.toUpperCase().replace(/'/g, "''")}'`,
    outFields: "APN",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  // Distinguish an UPSTREAM failure (timeout / 5xx / Esri's HTTP-200 {error} body) from a genuine
  // not-found, so the route returns 502 (service down), never 404 ("APN doesn't exist"), on a valid
  // APN during an outage. Mirrors the shared esri.ts queryFeatures behavior.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let json: unknown;
  try {
    const res = await fetch(`${FRESNO_PARCEL_LAYER}/query?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new ParcelLookupError("upstream", `parcel service returned HTTP ${res.status}`);
    json = await res.json();
  } catch (cause) {
    if (cause instanceof ParcelLookupError) throw cause;
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ParcelLookupError("upstream", `parcel service request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  if (json && typeof json === "object" && "error" in json) {
    throw new ParcelLookupError("upstream", "parcel service returned an error");
  }
  const fc = json as GjFeatureCollection;
  const f = fc.features?.find((feat) => feat.geometry !== null);
  if (!f || !f.geometry) return null; // a valid response with no such parcel -> genuine not-found
  const geometry = normalize(f.geometry);
  const { acres, centroidLat, centroidLng } = polygonAcresAndCentroid(geometry);
  const base: EngineParcel = {
    apn: String(f.properties?.APN ?? clean),
    county: "Fresno",
    geometry,
    centroid_lat: round(centroidLat, 7),
    centroid_lon: round(centroidLng, 7),
    source_url: FRESNO_PARCEL_LAYER,
    gross_acres: round(acres, 1),
  };
  return toBlock(base, todayIso);
}
