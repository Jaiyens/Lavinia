// Public API for the parcel lookup module. Import from "@/lib/parcel".
export { lookupParcelByPoint, lookupParcelsByBbox, type LookupOptions } from "./lookup";
export { adapterForPoint, adaptersForBbox, adaptersForPoint, COUNTY_ADAPTERS } from "./registry";
export { createEsriParcelAdapter, type EsriParcelAdapterConfig } from "./esri";
export { polygonAcresAndCentroid, distanceMetersPointToGeometry, type AreaCentroid } from "./geo";
export {
  ParcelLookupError,
  type BBox,
  type BBoxParcel,
  type BBoxResult,
  type CountyParcelAdapter,
  type LatLng,
  type ParcelErrorCode,
  type ParcelFields,
  type ParcelGeometry,
  type ParcelMatch,
  type ParcelResult,
  type Position,
  type RawParcelHit,
} from "./types";
