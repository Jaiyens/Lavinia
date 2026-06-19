// Public API for the parcel lookup module. Import from "@/lib/parcel".
export { lookupParcelByPoint, type LookupOptions } from "./lookup";
export { adapterForPoint, COUNTY_ADAPTERS } from "./registry";
export { createEsriParcelAdapter, type EsriParcelAdapterConfig } from "./esri";
export { polygonAcresAndCentroid, distanceMetersPointToGeometry, type AreaCentroid } from "./geo";
export {
  ParcelLookupError,
  type BBox,
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
