// Tulare County, CA parcels. Public hosted Esri FeatureServer (token-free, GeoJSON, polygons). The
// `APN` field is numeric and drops the leading zero, so `PARCELID` (formatted, e.g. "093-146-010")
// is the safer assessor-number field. Note this layer is index 2. Verified live near Visalia.

import { createEsriParcelAdapter } from "../esri";

export const TULARE_PARCEL_LAYER =
  "https://services2.arcgis.com/bYBANhmQGwSSLC0l/ArcGIS/rest/services/Public_Parcel_Search/FeatureServer/2";

export const tulareAdapter = createEsriParcelAdapter({
  county: "Tulare",
  bbox: { minLat: 35.7858, maxLat: 36.7536, minLng: -119.575, maxLng: -117.9703 },
  layerUrl: TULARE_PARCEL_LAYER,
  apnFields: ["PARCELID", "APN", "ASMT"],
  sourcePage: "https://www.tularecounty.ca.gov/rma/index.cfm/gis/",
});
