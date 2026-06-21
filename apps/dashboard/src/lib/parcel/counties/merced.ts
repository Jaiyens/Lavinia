// Merced County, CA parcels. Self-hosted county ArcGIS Server (token-free, GeoJSON, polygons). The
// parcels layer is index 42 (not 0; /FeatureServer/0 returns 500). APN in the `APN` field. Verified
// live near Merced city. Stored in State Plane Zone 3 but honors outSR=4326.

import { createEsriParcelAdapter } from "../esri";

export const MERCED_PARCEL_LAYER =
  "https://gis.countyofmerced.com/server/rest/services/Assessment_Parcels/FeatureServer/42";

export const mercedAdapter = createEsriParcelAdapter({
  county: "Merced",
  bbox: { minLat: 36.7405, maxLat: 37.6335, minLng: -121.2478, maxLng: -120.0527 },
  layerUrl: MERCED_PARCEL_LAYER,
  apnFields: ["APN", "ASMT", "PARCEL_NO", "PARCEL"],
  sourcePage: "https://www.countyofmerced.com/126/Geographic-Information-Systems",
});
