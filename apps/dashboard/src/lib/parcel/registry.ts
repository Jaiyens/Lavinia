// The county adapter registry + point dispatch. Adding a county = add its adapter to this list.
// Nothing county-specific lives outside an adapter; the dispatcher only reads bbox.

import type { CountyParcelAdapter, LatLng } from "./types";
import { fresnoAdapter } from "./counties/fresno";

// Order matters only if two bboxes overlap (the first match wins); today's counties don't.
export const COUNTY_ADAPTERS: readonly CountyParcelAdapter[] = [fresnoAdapter];

/** The adapter whose bbox contains the point, or null if no county covers it yet. */
export function adapterForPoint(
  point: LatLng,
  adapters: readonly CountyParcelAdapter[] = COUNTY_ADAPTERS,
): CountyParcelAdapter | null {
  return (
    adapters.find(
      (adapter) =>
        point.lat >= adapter.bbox.minLat &&
        point.lat <= adapter.bbox.maxLat &&
        point.lng >= adapter.bbox.minLng &&
        point.lng <= adapter.bbox.maxLng,
    ) ?? null
  );
}
