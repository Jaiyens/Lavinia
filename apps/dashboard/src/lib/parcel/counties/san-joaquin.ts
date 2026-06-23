// San Joaquin County, CA parcels. Public hosted Esri FeatureServer (Public Works GIS, token-free,
// GeoJSON, polygons, ~252k parcels). APN in the `APN` field. Verified live near Stockton. Do not use
// the webmaps.sjcounty.net child-parcel layer (its parcel-number field is mostly null).

import { createEsriParcelAdapter } from "../esri";

export const SAN_JOAQUIN_PARCEL_LAYER =
  "https://services2.arcgis.com/GQhSReJEO6f7tsvy/arcgis/rest/services/Parcels/FeatureServer/0";

export const sanJoaquinAdapter = createEsriParcelAdapter({
  county: "San Joaquin",
  bbox: { minLat: 37.48, maxLat: 38.3, minLng: -121.59, maxLng: -120.91 },
  layerUrl: SAN_JOAQUIN_PARCEL_LAYER,
  apnFields: ["APN", "APN_CHR", "PARCELID"],
  sourcePage: "https://www.sjmap.org/",
});
