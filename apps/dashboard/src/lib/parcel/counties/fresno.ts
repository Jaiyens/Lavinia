// Fresno County, CA parcels. The whole adapter is a config object because Fresno's parcels are
// published as a standard public Esri FeatureServer (Fresno State's water-and-sustainability
// ArcGIS Online org, openly shared, token-free, CORS-open, ~0.3s responses, ~296k parcels).
//
// FIELD: the APN lives in the `APN` field (e.g. "33803239S"). The other candidates are listed so
// the same adapter survives a schema rename, and so this file documents the naming variance the
// README warns about (counties use APN / PARCELID / ASMT / PARCEL_NUM / ...).
//
// SOURCE (human): the county's official parcel distribution page, for the downloadable shapefile
// fallback and provenance:
//   https://www.fresnocountyca.gov/Departments/Public-Works-and-Planning/divisions-of-public-works-and-planning/cds

import { createEsriParcelAdapter } from "../esri";

export const FRESNO_PARCEL_LAYER =
  "https://services6.arcgis.com/Gs01XZPFhKUG8tKU/arcgis/rest/services/Fresno_County_Parcels/FeatureServer/0";

export const fresnoAdapter = createEsriParcelAdapter({
  county: "Fresno",
  // Fresno County's extent, padded slightly. Used only to route a point to this adapter.
  bbox: { minLat: 35.9, maxLat: 37.6, minLng: -120.95, maxLng: -118.35 },
  layerUrl: FRESNO_PARCEL_LAYER,
  apnFields: ["APN", "PARCELID", "ASMT", "PARCEL_NUM", "ASSESSMENT"],
  sourcePage:
    "https://www.fresnocountyca.gov/Departments/Public-Works-and-Planning/divisions-of-public-works-and-planning/cds",
  bufferMeters: 25,
});
