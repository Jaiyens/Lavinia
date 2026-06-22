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
import type { ParcelGeometry } from "../types";

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

type SoilEnrichment = { soilClass: Sourced<string> | null; slopePct: Sourced<number> | null };
const SSURGO_SOURCE = "USDA SSURGO (Soil Data Access)";

async function enrichSoil(lat: number, lng: number): Promise<SoilEnrichment> {
  // The soil series (mapunit name) + the dominant component's representative slope, in one query.
  const query =
    `SELECT TOP 1 mu.muname, c.slope_r FROM mapunit mu ` +
    `INNER JOIN component c ON c.mukey = mu.mukey ` +
    `WHERE mu.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})')) ` +
    `ORDER BY c.comppct_r DESC`;
  try {
    const json = await fetchJson(SDA_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }),
    });
    const table = (json as { Table?: unknown[][] }).Table;
    // Row 0 is the column-name header; row 1 is the first data row.
    const row = Array.isArray(table) && table[1] ? table[1] : null;
    if (!row) return { soilClass: null, slopePct: null };
    // "Delhi loamy sand, 0 to 3 percent slopes, MLRA 17" -> "Delhi loamy sand".
    const muname = str(row[0]);
    const series = muname ? muname.split(",")[0]!.trim() : null;
    const slopeRaw = row[1] === null || row[1] === undefined ? null : Number(row[1]);
    const slope = slopeRaw !== null && Number.isFinite(slopeRaw) ? Math.round(slopeRaw * 10) / 10 : null;
    return {
      soilClass: series ? { value: series, source: SSURGO_SOURCE } : null,
      slopePct: slope !== null ? { value: slope, source: SSURGO_SOURCE } : null,
    };
  } catch {
    return { soilClass: null, slopePct: null };
  }
}

// --- wells (DWR OSWCR well completion reports) ------------------------------------------------
// The nearest agricultural well's reported completion depth + yield, from the public Well Completion
// Report layer. Per-well points (location precision varies; older records snap to section center),
// so this is framed as the NEAREST well, reported AT DRILLING - not "this parcel's well". Pump
// horsepower is never collected by the state, so it stays representative.

const OSWCR_LAYER =
  "https://gis.water.ca.gov/arcgis/rest/services/Environment/i07_WellCompletionReports/FeatureServer/0";
const OSWCR_SOURCE = "DWR OSWCR (nearest well, reported at drilling)";

type WellEnrichment = { depthFt: Sourced<number> | null; capacityGpm: Sourced<number> | null };

async function enrichWells(lat: number, lng: number): Promise<WellEnrichment> {
  const d = 0.018; // ~2 km half-envelope around the parcel centroid
  const params = new URLSearchParams({
    geometry: `${lng - d},${lat - d},${lng + d},${lat + d}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "TotalCompletedDepth,WellYield,WellYieldUnitofMeasure,PlannedUseFormerUse,B118WellUse,DecimalLatitude,DecimalLongitude",
    returnGeometry: "false",
    resultRecordCount: "100",
    f: "json",
  });
  try {
    const json = await fetchJson(`${OSWCR_LAYER}/query?${params.toString()}`);
    const feats =
      json && typeof json === "object" && Array.isArray((json as { features?: unknown }).features)
        ? (json as { features: Array<{ attributes?: Record<string, unknown> }> }).features
        : [];
    let best: { dist: number; depth: number | null; gpm: number | null } | null = null;
    for (const f of feats) {
      const a = f.attributes ?? {};
      const use = `${str(a.PlannedUseFormerUse) ?? ""} ${str(a.B118WellUse) ?? ""}`.toLowerCase();
      if (!/irrigation|agricultur/.test(use)) continue; // ag wells only
      const wlat = Number(a.DecimalLatitude);
      const wlng = Number(a.DecimalLongitude);
      if (!Number.isFinite(wlat) || !Number.isFinite(wlng)) continue;
      const depthRaw = a.TotalCompletedDepth === null || a.TotalCompletedDepth === undefined ? NaN : Number(a.TotalCompletedDepth);
      const depth = Number.isFinite(depthRaw) && depthRaw > 0 ? Math.round(depthRaw) : null;
      const unit = (str(a.WellYieldUnitofMeasure) ?? "").toLowerCase();
      const yieldNum = Number(String(a.WellYield ?? "").replace(/[^0-9.]/g, ""));
      const gpm = /gpm|gallons per minute/.test(unit) && Number.isFinite(yieldNum) && yieldNum > 0 ? Math.round(yieldNum) : null;
      if (depth === null && gpm === null) continue;
      const dist = (wlat - lat) ** 2 + (wlng - lng) ** 2;
      if (best === null || dist < best.dist) best = { dist, depth, gpm };
    }
    if (best === null) return { depthFt: null, capacityGpm: null };
    return {
      depthFt: best.depth !== null ? { value: best.depth, source: OSWCR_SOURCE } : null,
      capacityGpm: best.gpm !== null ? { value: best.gpm, source: OSWCR_SOURCE } : null,
    };
  } catch {
    return { depthFt: null, capacityGpm: null };
  }
}

// --- ET (OpenET) — real per-parcel, behind a free OPENET_API_KEY -------------------------------
// OpenET is NOT keyless: it needs a free API key in OPENET_API_KEY (server-only). With the key + the
// parcel polygon we POST the polygon timeseries (model=Ensemble) and convert seasonal ET inches over
// the parcel area to acre-feet. Without a key (or polygon/acres) it returns null and the generator
// fills et_estimate_af (which the drawer then tags "sample"). So ET goes live the moment a key lands.
const OPENET_ENDPOINT = "https://openet-api.org/raster/timeseries/polygon";

async function enrichEt(opts?: EnrichOpts): Promise<Sourced<number> | null> {
  const key = process.env.OPENET_API_KEY;
  const geometry = opts?.geometry;
  const acres = opts?.acres;
  if (!key || !geometry || acres === undefined || acres <= 0) return null;
  // Outer ring of the first polygon as a flat [lng,lat,...] list (OpenET's polygon geometry format).
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
  if (!ring || ring.length < 4) return null;
  const flat = ring.flatMap((p) => [p[0], p[1]]);
  // Trailing 12 months as a seasonal proxy (ingest/seed time, not a render path).
  const end = new Date();
  const start = new Date(end.getTime());
  start.setMonth(start.getMonth() - 12);
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  try {
    const json = await fetchJson(
      OPENET_ENDPOINT,
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: key },
        body: JSON.stringify({
          date_range: [iso(start), iso(end)],
          interval: "monthly",
          geometry: flat,
          model: "Ensemble",
          variable: "ET",
          reference_et: "gridMET",
          units: "in",
          file_format: "JSON",
        }),
      },
      20_000,
    );
    // Response: monthly rows; sum ET inches over the parcel, then inches -> acre-feet via the area.
    const rows = Array.isArray(json) ? (json as Array<Record<string, unknown>>) : [];
    let inches = 0;
    for (const r of rows) {
      const v = Number(r.et ?? r.value ?? r.ET);
      if (Number.isFinite(v)) inches += v;
    }
    if (inches <= 0) return null;
    const acreFeet = Math.round((inches / 12) * acres * 10) / 10;
    return { value: acreFeet, source: "OpenET (Ensemble, trailing 12 mo)" };
  } catch {
    return null;
  }
}

/** Optional context for enrichers that need the parcel polygon / area (OpenET). */
export type EnrichOpts = { geometry?: ParcelGeometry; acres?: number };

/**
 * Run every enricher for a parcel centroid, best-effort and in parallel. Any source that fails or
 * has no data is simply omitted (the representative generator fills it). Safe to call at seed time
 * or at live ingest. `opts` (the parcel polygon + acres) powers polygon-based enrichers (OpenET).
 */
export async function enrichParcel(lat: number, lng: number, opts?: EnrichOpts): Promise<Enrichment> {
  const [crop, gsa, waterDistrict, soil, wells, et] = await Promise.all([
    enrichCrop(lat, lng).catch(() => null),
    enrichGsa(lat, lng).catch(() => null),
    enrichWaterDistrict(lat, lng).catch(() => null),
    enrichSoil(lat, lng).catch((): SoilEnrichment => ({ soilClass: null, slopePct: null })),
    enrichWells(lat, lng).catch((): WellEnrichment => ({ depthFt: null, capacityGpm: null })),
    enrichEt(opts).catch(() => null),
  ]);
  const out: Enrichment = {};
  if (crop) out.crop = crop;
  if (gsa) out.gsa_name = gsa;
  if (waterDistrict) out.water_district = waterDistrict;
  if (soil.soilClass) out.soil_class = soil.soilClass;
  if (soil.slopePct) out.slope_pct = soil.slopePct;
  if (wells.depthFt) out.well_depth_ft = wells.depthFt;
  if (wells.capacityGpm) out.well_capacity_gpm = wells.capacityGpm;
  if (et) out.et_estimate_af = et;
  return out;
}
