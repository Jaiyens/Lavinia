// Kings County, CA parcels. Public hosted Esri FeatureServer (token-free, GeoJSON, polygons). APN in
// the `APN` field (e.g. "012172044000"). Verified live near Hanford.

import { createEsriParcelAdapter } from "../esri";

export const KINGS_PARCEL_LAYER =
  "https://services3.arcgis.com/24gLq1DBBzDfd0cZ/arcgis/rest/services/Parcels/FeatureServer/0";

export const kingsAdapter = createEsriParcelAdapter({
  county: "Kings",
  bbox: { minLat: 35.7884, maxLat: 36.4889, minLng: -120.3152, maxLng: -119.4744 },
  layerUrl: KINGS_PARCEL_LAYER,
  apnFields: ["APN", "ASMT", "PARCELID"],
  sourcePage: "https://www.countyofkings.com/departments/general-services/information-technology/gis",
});
