// Sacramento County, CA parcels. Public hosted Esri FeatureServer (county GIS Open Data, token-free,
// GeoJSON, polygons, ~400k parcels). APN in the `APN` field (14-digit, e.g. "00100310020000").
// Verified live near downtown Sacramento.

import { createEsriParcelAdapter } from "../esri";

export const SACRAMENTO_PARCEL_LAYER =
  "https://services1.arcgis.com/5NARefyPVtAeuJPU/arcgis/rest/services/Parcels/FeatureServer/0";

export const sacramentoAdapter = createEsriParcelAdapter({
  county: "Sacramento",
  bbox: { minLat: 38.02, maxLat: 38.74, minLng: -121.86, maxLng: -121.03 },
  layerUrl: SACRAMENTO_PARCEL_LAYER,
  apnFields: ["APN", "PARCELID", "ASMT"],
  sourcePage: "https://data-sacramentocounty.opendata.arcgis.com/",
});
