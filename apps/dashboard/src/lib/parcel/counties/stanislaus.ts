// Stanislaus County, CA parcels. Public hosted Esri FeatureServer (token-free, GeoJSON, polygons).
// APN in the `APN` field. Verified live near Modesto. Use this ArcGIS Online layer, not the county's
// own gis2.stancounty.com server (slow / times out).

import { createEsriParcelAdapter } from "../esri";

export const STANISLAUS_PARCEL_LAYER =
  "https://services.arcgis.com/EeYBJFxLdUojipYa/arcgis/rest/services/Public_Parcels/FeatureServer/0";

export const stanislausAdapter = createEsriParcelAdapter({
  county: "Stanislaus",
  bbox: { minLat: 37.1325, maxLat: 38.0782, minLng: -121.4952, maxLng: -120.3871 },
  layerUrl: STANISLAUS_PARCEL_LAYER,
  apnFields: ["APN", "ASMT", "PARCEL", "PARCEL_NO"],
  sourcePage: "https://www.stancounty.com/gis/",
});
