// The core: lookupParcelByPoint(lat, lng). Dispatches a point to its county adapter, then
// normalizes the raw hit into the ParcelResult contract — computing acreage + centroid in
// EPSG:3310 (geo.ts) so every county returns the same equal-area numbers regardless of the
// source CRS. County-specific knowledge lives entirely in the adapters; this file is generic.

import { polygonAcresAndCentroid } from "./geo";
import { adaptersForBbox, adaptersForPoint, COUNTY_ADAPTERS } from "./registry";
import {
  ParcelLookupError,
  type BBox,
  type BBoxParcel,
  type BBoxResult,
  type CountyParcelAdapter,
  type ParcelResult,
} from "./types";

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export type LookupOptions = {
  /** Override the adapter set (used by tests). Defaults to the live registry. */
  adapters?: readonly CountyParcelAdapter[];
};

/**
 * Find the public-records parcel that contains (lat, lng) and return its APN + boundary + derived
 * acreage/centroid. Returns null when the covering county genuinely has no parcel at the point
 * (even after the road-gap buffer). Throws ParcelLookupError for invalid input, no coverage, or
 * an upstream failure, so the caller can map each to the right response.
 */
export async function lookupParcelByPoint(
  lat: number,
  lng: number,
  options: LookupOptions = {},
): Promise<ParcelResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ParcelLookupError(
      "invalid_point",
      "latitude must be within +/-90 and longitude within +/-180",
    );
  }

  const adapters = options.adapters ?? COUNTY_ADAPTERS;
  // County bboxes overlap, so a point can fall inside several. Try each covering county until one
  // actually contains the parcel; a county whose service errors is skipped (its error is only
  // surfaced if NO county yields a parcel), so one county's outage never hides a real neighbor hit.
  const candidates = adaptersForPoint({ lat, lng }, adapters);
  if (candidates.length === 0) {
    throw new ParcelLookupError("out_of_coverage", "no parcel source covers this point yet");
  }

  let lastError: unknown = null;
  for (const adapter of candidates) {
    let hit;
    try {
      hit = await adapter.lookupByPoint({ lat, lng });
    } catch (cause) {
      lastError = cause;
      continue;
    }
    if (!hit) continue;
    const { acres, centroidLat, centroidLng } = polygonAcresAndCentroid(hit.geometry);
    return {
      apn: hit.apn,
      county: adapter.county,
      parcel_acres: round(acres, 2),
      centroid_lat: round(centroidLat, 7),
      centroid_lon: round(centroidLng, 7),
      geometry: hit.geometry,
      source_url: hit.sourceUrl,
      match: hit.match,
      distance_m: hit.distanceMeters === null ? null : round(hit.distanceMeters, 1),
      fields: hit.fields,
    };
  }
  // No county returned a parcel. If every candidate errored, surface that; else it's a clean miss.
  if (lastError !== null) throw lastError;
  return null;
}

const isFiniteNum = (n: number): boolean => Number.isFinite(n);

/** Intersect two boxes; returns null when they don't overlap. */
function intersectBox(a: BBox, b: BBox): BBox | null {
  const minLat = Math.max(a.minLat, b.minLat);
  const maxLat = Math.min(a.maxLat, b.maxLat);
  const minLng = Math.max(a.minLng, b.minLng);
  const maxLng = Math.min(a.maxLng, b.maxLng);
  if (minLat >= maxLat || minLng >= maxLng) return null;
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Every parcel whose boundary intersects `box` (a map viewport), APN + geometry only, across all
 * counties the box touches. Each adapter's query is clipped to box ∩ county so a county only sees
 * its own area; results are merged and de-duped by APN (parcels on a county seam). `capped` is true
 * if any adapter truncated. Throws out_of_coverage when no county intersects the box.
 */
export async function lookupParcelsByBbox(
  box: BBox,
  options: LookupOptions = {},
): Promise<BBoxResult> {
  if (
    !isFiniteNum(box.minLat) ||
    !isFiniteNum(box.maxLat) ||
    !isFiniteNum(box.minLng) ||
    !isFiniteNum(box.maxLng) ||
    box.minLat >= box.maxLat ||
    box.minLng >= box.maxLng ||
    Math.abs(box.minLat) > 90 ||
    Math.abs(box.maxLat) > 90 ||
    Math.abs(box.minLng) > 180 ||
    Math.abs(box.maxLng) > 180
  ) {
    throw new ParcelLookupError("invalid_point", "bbox must be minLng<maxLng, minLat<maxLat, in range");
  }

  const adapters = options.adapters ?? COUNTY_ADAPTERS;
  const covering = adaptersForBbox(box, adapters).filter(
    (a): a is CountyParcelAdapter & { lookupByBbox: NonNullable<CountyParcelAdapter["lookupByBbox"]> } =>
      typeof a.lookupByBbox === "function",
  );
  if (covering.length === 0) {
    throw new ParcelLookupError("out_of_coverage", "no parcel source covers this viewport yet");
  }

  const results = await Promise.all(
    covering.map((adapter) => {
      const clipped = intersectBox(box, adapter.bbox) ?? box;
      return adapter.lookupByBbox(clipped);
    }),
  );

  const byApn = new Map<string, BBoxParcel>();
  let capped = false;
  for (const r of results) {
    if (r.capped) capped = true;
    for (const p of r.parcels) {
      if (!byApn.has(p.apn)) byApn.set(p.apn, p);
    }
  }
  return { parcels: [...byApn.values()], capped };
}
