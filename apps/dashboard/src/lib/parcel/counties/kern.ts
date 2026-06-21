// Kern County, CA parcels. Public hosted Esri FeatureServer (token-free, GeoJSON, polygons). APN in
// the `APN` field (8-char; `APN9` and `APN_LABEL` are variants). Verified live near Bakersfield.
// NOTE: the service is the "2025" Land edition; the name may roll with future assessment years.

import { createEsriParcelAdapter } from "../esri";

export const KERN_PARCEL_LAYER =
  "https://services5.arcgis.com/Y8jwjGUWbRjuqpG5/arcgis/rest/services/Assessor_Parcels_Land_2025/FeatureServer/0";

export const kernAdapter = createEsriParcelAdapter({
  county: "Kern",
  bbox: { minLat: 34.7724, maxLat: 35.8089, minLng: -120.1987, maxLng: -117.6158 },
  layerUrl: KERN_PARCEL_LAYER,
  apnFields: ["APN", "APN9", "APN_LABEL"],
  sourcePage: "https://www.kerncounty.com/government/county-administrative-office/gis",
});
