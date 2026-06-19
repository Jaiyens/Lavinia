// The core: lookupParcelByPoint(lat, lng). Dispatches a point to its county adapter, then
// normalizes the raw hit into the ParcelResult contract — computing acreage + centroid in
// EPSG:3310 (geo.ts) so every county returns the same equal-area numbers regardless of the
// source CRS. County-specific knowledge lives entirely in the adapters; this file is generic.

import { polygonAcresAndCentroid } from "./geo";
import { adapterForPoint, COUNTY_ADAPTERS } from "./registry";
import { ParcelLookupError, type CountyParcelAdapter, type ParcelResult } from "./types";

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
  const adapter = adapterForPoint({ lat, lng }, adapters);
  if (!adapter) {
    throw new ParcelLookupError("out_of_coverage", "no parcel source covers this point yet");
  }

  const hit = await adapter.lookupByPoint({ lat, lng });
  if (!hit) return null;

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
