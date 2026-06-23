// The serializable parcel-boundary underlay for the Energy map lens. Projects the farm's parcels
// (real county geometry from the committed fixture, src/lib/parcel/farm) into a minimal GeoJSON
// FeatureCollection the map draws beneath the meter pins. Geometry only - no ops/financial data
// crosses to the client here, just the boundary + an APN/name for the (future) feature inspection.

import type { FarmParcel } from "@/lib/parcel/farm/types";
import type { ParcelGeometry } from "@/lib/parcel/types";

export type ParcelOverlayFeature = {
  type: "Feature";
  geometry: ParcelGeometry;
  properties: { apn: string; name: string };
};

export type ParcelOverlay = {
  type: "FeatureCollection";
  features: ParcelOverlayFeature[];
};

/** Build the GeoJSON underlay from a farm's parcels (boundary + APN/name only). */
export function toParcelOverlay(parcels: readonly FarmParcel[]): ParcelOverlay {
  return {
    type: "FeatureCollection",
    features: parcels.map((p) => ({
      type: "Feature",
      geometry: p.geometry,
      properties: { apn: p.apn, name: p.name },
    })),
  };
}
