// Madera County, CA parcels. Public hosted Esri FeatureServer (token-free, GeoJSON, polygons). The
// assessor number lives in `ASMT` (12-digit, e.g. "003010001000"); `Parcel` carries a formatted
// variant. Verified live near the city of Madera. The county's own gis.maderacounty.com server and
// some org layers require a token; this public hosted copy does not.

import { createEsriParcelAdapter } from "../esri";

export const MADERA_PARCEL_LAYER =
  "https://services6.arcgis.com/1t7wwtWWQetYRAXB/arcgis/rest/services/Parcels/FeatureServer/0";

export const maderaAdapter = createEsriParcelAdapter({
  county: "Madera",
  bbox: { minLat: 36.7538, maxLat: 37.7842, minLng: -120.5453, maxLng: -119.0193 },
  layerUrl: MADERA_PARCEL_LAYER,
  apnFields: ["ASMT", "Parcel", "APN", "PARCELID"],
  sourcePage: "https://www.maderacounty.com/government/gis",
});
