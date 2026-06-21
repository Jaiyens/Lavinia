// The county adapter registry + point dispatch. Adding a county = add its adapter to this list.
// Nothing county-specific lives outside an adapter; the dispatcher only reads bbox.

import type { BBox, CountyParcelAdapter, LatLng } from "./types";
import { fresnoAdapter } from "./counties/fresno";
import { CENTRAL_VALLEY_ADAPTERS } from "./counties";

// Order matters only if two bboxes overlap (the first match wins). Fresno is listed first (it is
// validated + carries the Batth demo); the rest of the Central Valley follows.
export const COUNTY_ADAPTERS: readonly CountyParcelAdapter[] = [
  fresnoAdapter,
  ...CENTRAL_VALLEY_ADAPTERS.filter((a) => a.county !== fresnoAdapter.county),
];

function bboxContains(adapter: CountyParcelAdapter, point: LatLng): boolean {
  return (
    point.lat >= adapter.bbox.minLat &&
    point.lat <= adapter.bbox.maxLat &&
    point.lng >= adapter.bbox.minLng &&
    point.lng <= adapter.bbox.maxLng
  );
}

/** The first adapter whose bbox contains the point, or null if no county covers it yet. */
export function adapterForPoint(
  point: LatLng,
  adapters: readonly CountyParcelAdapter[] = COUNTY_ADAPTERS,
): CountyParcelAdapter | null {
  return adapters.find((adapter) => bboxContains(adapter, point)) ?? null;
}

/**
 * EVERY adapter whose bbox contains the point. County bboxes are rectangular approximations of
 * irregular shapes, so they overlap (Fresno's box covers points actually in Tulare/Kings/Madera).
 * The caller tries each candidate's point lookup until one returns the real parcel, instead of
 * trusting the first overlapping box.
 */
export function adaptersForPoint(
  point: LatLng,
  adapters: readonly CountyParcelAdapter[] = COUNTY_ADAPTERS,
): CountyParcelAdapter[] {
  return adapters.filter((adapter) => bboxContains(adapter, point));
}

/** Every adapter whose county extent intersects `box` (AABB overlap), for a viewport query. */
export function adaptersForBbox(
  box: BBox,
  adapters: readonly CountyParcelAdapter[] = COUNTY_ADAPTERS,
): CountyParcelAdapter[] {
  return adapters.filter(
    (adapter) =>
      !(
        adapter.bbox.maxLng < box.minLng ||
        adapter.bbox.minLng > box.maxLng ||
        adapter.bbox.maxLat < box.minLat ||
        adapter.bbox.minLat > box.maxLat
      ),
  );
}
