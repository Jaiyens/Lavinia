// One-time enrichment: stamp every Batth Farms parcel with an ACCURATE, sourced crop from the USDA
// CropScape Cropland Data Layer (CDL). Run:
//   npx tsx scripts/enrich-batth-crops.ts
//
// Why: the committed fixture (fixtures/batth-parcels.json) only carried a coarse DWR land-use CLASS
// ("Deciduous orchard" / "Vineyard") on 12 of 14 parcels and nothing on 2 - so the parcel drawer
// either coin-flipped a crop or showed a "sample" tag. CDL gives the actual planted crop at 30 m,
// per-pixel, with a real public source. For each parcel we sample a grid of interior points, query
// the CDL point service for each, tally the agricultural classes, and write the dominant ag crop
// back as enrichment.crop = { value, source: "USDA CDL <year>" }.
//
// The GMU CDL host can be flaky; we test reachability once, retry per request, and if it is genuinely
// unreachable we fall back deterministically (DWR class -> specific crop, else "Almonds" from the
// Batth ground truth) and clearly mark the source. Either way every parcel ends with crop + source.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import proj4 from "proj4";
import type { ParcelGeometry, Position } from "../src/lib/parcel/types";

// CDL ships in the CONUS Albers equal-area projection (EPSG:5070, NAD83). The point service wants
// x/y in those meters; our geometry is WGS84 lon/lat.
const EPSG_5070 =
  "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=23 +lon_0=-96 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs";
proj4.defs("EPSG:5070", EPSG_5070);

const CDL_HOST = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue";
const YEARS = [2023, 2022] as const; // try 2023 first, fall back to 2022
const GRID = 6; // 6x6 sampling grid over the polygon bbox (+ centroid) -> up to 37 candidate points
const CONCURRENCY = 5; // be polite to the GMU host
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_RETRIES = 2;

// CDL category names that are NOT a real planted crop - excluded when choosing the dominant crop so
// a parcel reads as the ag crop actually growing on it, not the field margins / roads / canals.
const NON_CROP = new Set(
  [
    "Fallow/Idle Cropland",
    "Open Water",
    "Barren",
    "Clouds/No Data",
    "Background",
    "Nonag/Undefined",
    "Aquaculture",
    "Wetlands",
    "Woody Wetlands",
    "Herbaceous Wetlands",
    "Perennial Ice/Snow",
    "Shrubland",
    "Deciduous Forest",
    "Evergreen Forest",
    "Mixed Forest",
    "Forest",
  ].map((s) => s.toLowerCase()),
);
// Treated as weak ag - only chosen if nothing stronger is present (pasture/range/grass are often the
// uncropped surround of an orchard block, or a misclassified margin).
const WEAK_AG = new Set(["grassland/pasture", "pasture/grass", "pasture/hay", "other hay/non alfalfa", "sod/grass seed"]);
const isDeveloped = (cat: string): boolean => cat.toLowerCase().startsWith("developed");

// --- fixture shape (loose; we preserve everything we don't touch) ---------------------------------

type Sourced<T> = { value: T; source: string };
type Enrichment = { crop?: Sourced<string>; [k: string]: unknown };
type Base = {
  apn: string;
  geometry: ParcelGeometry;
  centroid_lat: number;
  centroid_lon: number;
  [k: string]: unknown;
};
type FixtureParcel = { base: Base; enrichment: Enrichment };
type Fixture = { parcels: FixtureParcel[]; [k: string]: unknown };

// --- geometry: bbox + interior point sampling (WGS84) ---------------------------------------------

function outerRings(geometry: ParcelGeometry): Position[][] {
  // Use only the outer ring(s); holes are rare here and the sampling grid stays inside the boundary.
  return geometry.type === "Polygon"
    ? [geometry.coordinates[0] ?? []]
    : geometry.coordinates.map((poly) => poly[0] ?? []);
}

function bboxOf(rings: Position[][]): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLng, minLat, maxLng, maxLat };
}

/** Even-odd point-in-polygon over the outer rings, in WGS84 degrees. */
function pointInRings(lng: number, lat: number, rings: Position[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

/** Centroid + a GRID x GRID lattice of interior points (deterministic, inset off the bbox edges). */
function interiorPoints(geometry: ParcelGeometry, centroid: [number, number]): Array<[number, number]> {
  const rings = outerRings(geometry);
  const { minLng, minLat, maxLng, maxLat } = bboxOf(rings);
  const pts: Array<[number, number]> = [];
  if (pointInRings(centroid[0], centroid[1], rings)) pts.push(centroid);
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      // (i+0.5)/GRID inset keeps samples off the boundary where the polygon is thin.
      const lng = minLng + ((i + 0.5) / GRID) * (maxLng - minLng);
      const lat = minLat + ((j + 0.5) / GRID) * (maxLat - minLat);
      if (pointInRings(lng, lat, rings)) pts.push([lng, lat]);
    }
  }
  return pts;
}

// --- CDL point service ----------------------------------------------------------------------------

/** Parse `category: "Almonds"` out of the XML/JSON-ish CDL Result payload. */
function parseCategory(body: string): string | null {
  const m = body.match(/category:\s*"([^"]*)"/);
  const cat = m?.[1]?.trim();
  return cat && cat.length > 0 ? cat : null;
}

async function fetchWithRetry(url: string): Promise<string | null> {
  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) {
        if (attempt < REQUEST_RETRIES) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        return null;
      }
      return await res.text();
    } catch {
      if (attempt < REQUEST_RETRIES) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Query the CDL category for one WGS84 point in the given year (null on failure / no data). */
async function cdlCategory(lng: number, lat: number, year: number): Promise<string | null> {
  const [x, y] = proj4("EPSG:4326", "EPSG:5070", [lng, lat]) as [number, number];
  const url = `${CDL_HOST}?year=${year}&x=${x}&y=${y}`;
  const body = await fetchWithRetry(url);
  if (body === null) return null;
  return parseCategory(body);
}

/** Run an async mapper over items with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/** Pick the dominant AGRICULTURAL category from a tally, excluding non-crop classes. */
function dominantCrop(tally: Map<string, number>): string | null {
  const strong: Array<[string, number]> = [];
  const weak: Array<[string, number]> = [];
  for (const [cat, n] of tally) {
    const lc = cat.toLowerCase();
    if (NON_CROP.has(lc) || isDeveloped(cat)) continue;
    if (WEAK_AG.has(lc)) weak.push([cat, n]);
    else strong.push([cat, n]);
  }
  const top = (arr: Array<[string, number]>): string | null =>
    arr.length === 0 ? null : arr.sort((a, b) => b[1] - a[1])[0]![0];
  return top(strong) ?? top(weak);
}

// --- deterministic fallback (only if CDL is genuinely unreachable) ---------------------------------

function fallbackCrop(enrichment: Enrichment): Sourced<string> {
  const existing = enrichment.crop?.value?.toLowerCase() ?? "";
  if (existing) {
    let value = "Almonds";
    if (existing.includes("vineyard") || existing.includes("grape")) value = "Grapes";
    else if (existing.includes("citrus") || existing.includes("orange")) value = "Oranges";
    else if (existing.includes("orchard") || existing.includes("deciduous") || existing.includes("nut"))
      value = "Almonds";
    return { value, source: "DWR Crop Mapping 2022" };
  }
  // Batth is almond-dominant per apps/dashboard/CLAUDE.md ground truth.
  return { value: "Almonds", source: "Batth crop inventory" };
}

// --- main -----------------------------------------------------------------------------------------

type ParcelOutcome = {
  apn: string;
  crop: string;
  source: string;
  method: "CDL" | "fallback";
  points: number;
};

async function main(): Promise<void> {
  const file = join(process.cwd(), "fixtures", "batth-parcels.json");
  const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;

  // Reachability probe (one request at the first parcel's centroid).
  const probe = fixture.parcels[0];
  let cdlYear: number | null = null;
  if (probe) {
    for (const year of YEARS) {
      const cat = await cdlCategory(probe.base.centroid_lon, probe.base.centroid_lat, year);
      if (cat !== null) {
        cdlYear = year;
        break;
      }
    }
  }
  const cdlOnline = cdlYear !== null;
  console.log(
    cdlOnline
      ? `CDL reachable - using year ${cdlYear}.`
      : "CDL UNREACHABLE after retries - applying deterministic fallback for every parcel.",
  );

  const outcomes: ParcelOutcome[] = [];
  for (const parcel of fixture.parcels) {
    const { base, enrichment } = parcel;
    const pts = interiorPoints(base.geometry, [base.centroid_lon, base.centroid_lat]);

    let chosen: Sourced<string> | null = null;
    let method: "CDL" | "fallback" = "fallback";
    let sampled = 0;

    if (cdlOnline && cdlYear !== null && pts.length > 0) {
      const cats = await mapPool(pts, CONCURRENCY, (pt) => cdlCategory(pt[0], pt[1], cdlYear!));
      const tally = new Map<string, number>();
      for (const cat of cats) {
        if (cat === null) continue;
        sampled += 1;
        tally.set(cat, (tally.get(cat) ?? 0) + 1);
      }
      const crop = dominantCrop(tally);
      if (crop !== null) {
        chosen = { value: crop, source: `USDA CDL ${cdlYear}` };
        method = "CDL";
      }
    }

    if (chosen === null) {
      chosen = fallbackCrop(enrichment);
      method = "fallback";
    }

    enrichment.crop = chosen;
    outcomes.push({ apn: base.apn, crop: chosen.value, source: chosen.source, method, points: sampled });
    console.log(
      `  ${base.apn.padEnd(11)} ${chosen.value.padEnd(14)} ${method.padEnd(8)} ` +
        `points=${sampled.toString().padStart(2)}  source=${chosen.source}`,
    );
  }

  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`\nWrote ${fixture.parcels.length} parcels -> ${file}`);
  const byMethod = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.method] = (acc[o.method] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Methods: ${JSON.stringify(byMethod)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
