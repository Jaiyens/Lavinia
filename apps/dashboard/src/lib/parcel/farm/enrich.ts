// Auto-enrichment: spatial-join a parcel's centroid against FREE, KEYLESS public layers to pull
// real farm context. Used by the seed script (bakes results into the committed fixture so the app
// runs with zero external calls) and architected for the live "Connect your farm" path (enrich a
// farmer's APNs at ingest). Each enricher is best-effort with a timeout and falls back to null, so
// a slow/down source never blocks ingestion — the representative generator fills the gap.
//
// Wired live (all confirmed keyless at the test area):
//   - GSA            DWR SGMA Groundwater Sustainability Agencies  (GSA_Name)
//   - water district DWR Water Districts                           (AGENCYNAME; can be multiple)
//   - soil           USDA SSURGO via Soil Data Access POST         (mapunit.muname)
//   - crop           DWR Statewide Crop Mapping 2022               (coarse class; ag only)
// Stubbed (needs an API key):
//   - ET             OpenET. TODO: wire raster/timeseries/point behind OPENET_API_KEY.

import type { Enrichment, Sourced } from "./representative";

const DEFAULT_TIMEOUT_MS = 12_000;

async function fetchJson(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** First feature's attributes from an Esri layer intersected at a point, or [] on any failure. */
async function esriIntersect(
  layerUrl: string,
  lat: number,
  lng: number,
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`, // x=lng, y=lat
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  try {
    const json = await fetchJson(`${layerUrl}/query?${params.toString()}`);
    if (json && typeof json === "object" && Array.isArray((json as { features?: unknown }).features)) {
      const features = (json as { features: Array<{ attributes?: Record<string, unknown> }> }).features;
      return features.map((f) => f.attributes ?? {});
    }
  } catch {
    // best-effort: fall through to []
  }
  return [];
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
};

// --- crop (DWR Statewide Crop Mapping 2022) ---------------------------------------------------
// The layer's class fields are codes (SYMB_CLASS / CLASS1). We map the agricultural class letter
// to a readable category; non-ag codes (urban/idle/fallow: U, X, I, S, NR, "**") return null so
// the representative generator supplies a believable specific crop instead.

const DWR_CROP_LAYER =
  "https://utility.arcgis.com/usrsvcs/servers/8b0555ad7cb14dcab66901925427228a/rest/services/Planning/i15_Crop_Mapping_2022/MapServer/0";

const DWR_CLASS_LABEL: Record<string, string> = {
  G: "Grain & hay",
  R: "Rice",
  F: "Field crop",
  P: "Pasture",
  T: "Truck & row crop",
  D: "Deciduous orchard",
  C: "Citrus & subtropical",
  V: "Vineyard",
};

async function enrichCrop(lat: number, lng: number): Promise<Sourced<string> | null> {
  const rows = await esriIntersect(DWR_CROP_LAYER, lat, lng);
  const a = rows[0];
  if (!a) return null;
  const code = (str(a.SYMB_CLASS) ?? str(a.CLASS1) ?? "").charAt(0).toUpperCase();
  const label = DWR_CLASS_LABEL[code];
  if (!label) return null; // non-ag at this location -> representative crop
  // DWR gives the land-use class; the specific crop shown is a representative pick within it.
  return { value: label, source: "DWR Crop Mapping 2022 (land-use class)" };
}

// --- GSA (DWR SGMA) ---------------------------------------------------------------------------

const DWR_GSA_LAYER =
  "https://gis.water.ca.gov/arcgis/rest/services/Boundaries/i03_Groundwater_Sustainability_Agencies/MapServer/0";

async function enrichGsa(lat: number, lng: number): Promise<Sourced<string> | null> {
  const rows = await esriIntersect(DWR_GSA_LAYER, lat, lng);
  const name = rows[0] ? str(rows[0].GSA_Name) : null;
  return name ? { value: name, source: "DWR SGMA GSA boundaries" } : null;
}

// --- water district (DWR) ---------------------------------------------------------------------
// Districts overlap, so a point can return several. Prefer an irrigation/water district (the one
// that actually delivers water) over a broader conservation district; else take the first.

const DWR_WD_LAYER =
  "https://gis.water.ca.gov/arcgis/rest/services/Boundaries/i03_WaterDistricts/MapServer/0";

async function enrichWaterDistrict(lat: number, lng: number): Promise<Sourced<string> | null> {
  const rows = await esriIntersect(DWR_WD_LAYER, lat, lng);
  const names = rows.map((r) => str(r.AGENCYNAME)).filter((n): n is string => n !== null);
  if (names.length === 0) return null;
  // A point often falls inside several overlapping districts (no guaranteed order). Prefer an
  // actual delivery district (irrigation / water district) and exclude broad conservation, flood,
  // and authority entities that contain the literal phrase but do not deliver irrigation water.
  const isDelivery = (n: string): boolean =>
    /irrigation district|water district/i.test(n) && !/conservation|flood|authority/i.test(n);
  const delivery = names.find(isDelivery);
  return { value: delivery ?? names[0]!, source: "DWR Water Districts" };
}

// --- soil (USDA SSURGO via Soil Data Access) --------------------------------------------------
// Keyless, but a POST T-SQL query (not an Esri intersect): get the mukey at the point, join to
// mapunit for the soil series name. We trim the verbose muname to the leading series phrase.

const SDA_ENDPOINT = "https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest";

async function enrichSoil(lat: number, lng: number): Promise<Sourced<string> | null> {
  const query =
    `SELECT mu.muname FROM mapunit mu WHERE mu.mukey IN ` +
    `(SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})'))`;
  try {
    const json = await fetchJson(SDA_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }),
    });
    const table = (json as { Table?: unknown[][] }).Table;
    // Row 0 is the column-name header; row 1 is the first data row.
    const muname = Array.isArray(table) && table[1] ? str(table[1][0]) : null;
    if (!muname) return null;
    // "Delhi loamy sand, 0 to 3 percent slopes, MLRA 17" -> "Delhi loamy sand".
    const series = muname.split(",")[0]!.trim();
    return { value: series, source: "USDA SSURGO (Soil Data Access)" };
  } catch {
    return null;
  }
}

// --- ET (OpenET) — stubbed --------------------------------------------------------------------
// TODO: OpenET is NOT keyless. Wire POST https://openet-api.org/raster/timeseries/point with an
// Authorization header from a server-side OPENET_API_KEY env var (variable=ET, model=Ensemble),
// then store acre-feet over the season. Until then the representative generator fills et_estimate_af.
async function enrichEt(_lat: number, _lng: number): Promise<Sourced<number> | null> {
  return null;
}

/**
 * Run every enricher for a parcel centroid, best-effort and in parallel. Any source that fails or
 * has no data is simply omitted (the representative generator fills it). Safe to call at seed time
 * or at live ingest.
 */
export async function enrichParcel(lat: number, lng: number): Promise<Enrichment> {
  const [crop, gsa, waterDistrict, soil, et] = await Promise.all([
    enrichCrop(lat, lng).catch(() => null),
    enrichGsa(lat, lng).catch(() => null),
    enrichWaterDistrict(lat, lng).catch(() => null),
    enrichSoil(lat, lng).catch(() => null),
    enrichEt(lat, lng).catch(() => null),
  ]);
  const out: Enrichment = {};
  if (crop) out.crop = crop;
  if (gsa) out.gsa_name = gsa;
  if (waterDistrict) out.water_district = waterDistrict;
  if (soil) out.soil_class = soil;
  if (et) out.et_estimate_af = et;
  return out;
}
