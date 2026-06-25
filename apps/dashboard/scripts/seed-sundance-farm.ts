// One-time seed: build the committed Sundance Valley Farms demo fixture from REAL Fresno County
// parcels, auto-enriched from free public layers. This is the demo operation shown on the Parcels
// surface and the Home "Your parcels" tile. We use REAL assessor parcels (not translated shapes) so
// the polygons trace the actual field boundaries on the satellite basemap, with real APNs and real
// acreage. The location is open farmland near Easton/Fowler in Fresno County, deliberately away from
// the real Batth grower's land around Caruthers (this demo must carry no relation to that client).
// Run:  npx tsx scripts/seed-sundance-farm.ts
// Writes apps/dashboard/fixtures/sundance-parcels.json (real geometry + baked enrichment only; the
// operational model is regenerated at render time by representative.ts). Re-run to refresh, or move
// the demo by editing CENTER and re-running.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { polygonAcresAndCentroid } from "../src/lib/parcel/geo";
import { enrichParcel } from "../src/lib/parcel/farm/enrich";
import type { EngineParcel } from "../src/lib/parcel/farm/representative";
import type { FarmFixture, FixtureParcel } from "../src/lib/parcel/farm/seed";
import type { ParcelGeometry, Position } from "../src/lib/parcel/types";

const FRESNO_LAYER =
  "https://services6.arcgis.com/Gs01XZPFhKUG8tKU/arcgis/rest/services/Fresno_County_Parcels/FeatureServer/0";
const CENTER = { lat: 36.62, lng: -119.74 }; // Easton/Fowler farmland (non-Batth)
const HALF = 0.02; // ~2 km half-box, enough candidates to cluster a believable operation from
const MIN_ACRES = 12; // ag-sized blocks, not rural-residential slivers
const MAX_PARCELS = 14;
const FARM_NAME = "Sundance Valley Farms";
const OUT_FILE = "sundance-parcels.json";

type GjPosition = number[];
type GjPolygon = { type: "Polygon"; coordinates: GjPosition[][] };
type GjMultiPolygon = { type: "MultiPolygon"; coordinates: GjPosition[][][] };
type GjGeometry = GjPolygon | GjMultiPolygon;
type GjFeature = { properties: { APN?: string | null } | null; geometry: GjGeometry | null };
type GjFeatureCollection = { features: GjFeature[] };

const pos = (p: GjPosition): Position => [p[0]!, p[1]!];

function normalize(g: GjGeometry): ParcelGeometry {
  if (g.type === "Polygon") {
    return { type: "Polygon", coordinates: g.coordinates.map((ring) => ring.map(pos)) };
  }
  return {
    type: "MultiPolygon",
    coordinates: g.coordinates.map((poly) => poly.map((ring) => ring.map(pos))),
  };
}

const round = (n: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

async function main(): Promise<void> {
  const xmin = CENTER.lng - HALF;
  const xmax = CENTER.lng + HALF;
  const ymin = CENTER.lat - HALF;
  const ymax = CENTER.lat + HALF;
  const params = new URLSearchParams({
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    outFields: "APN",
    returnGeometry: "true",
    f: "geojson",
  });

  console.log(`Fetching Fresno parcels around ${CENTER.lat}, ${CENTER.lng}...`);
  const res = await fetch(`${FRESNO_LAYER}/query?${params.toString()}`);
  if (!res.ok) throw new Error(`envelope query failed: HTTP ${res.status}`);
  const fc = (await res.json()) as GjFeatureCollection;

  type Candidate = {
    apn: string;
    acres: number;
    centroidLat: number;
    centroidLng: number;
    dist: number;
    geometry: ParcelGeometry;
  };
  const byApn = new Map<string, Candidate>();
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const apn = String(f.properties?.APN ?? "").trim();
    if (!apn || byApn.has(apn)) continue;
    const geometry = normalize(f.geometry);
    const { acres, centroidLat, centroidLng } = polygonAcresAndCentroid(geometry);
    if (acres < MIN_ACRES) continue;
    const dist = Math.hypot(centroidLat - CENTER.lat, centroidLng - CENTER.lng);
    byApn.set(apn, { apn, acres, centroidLat, centroidLng, dist, geometry });
  }

  // Take the ag blocks NEAREST the point, for a tight, believable contiguous-ish operation.
  const chosen = [...byApn.values()].sort((a, b) => a.dist - b.dist).slice(0, MAX_PARCELS);
  console.log(`${fc.features.length} parcels in box -> ${chosen.length} ag blocks (>= ${MIN_ACRES} ac), nearest first.`);

  const parcels: FixtureParcel[] = [];
  for (const c of chosen) {
    const enrichment = await enrichParcel(c.centroidLat, c.centroidLng);
    const base: EngineParcel = {
      apn: c.apn,
      county: "Fresno",
      geometry: c.geometry,
      centroid_lat: round(c.centroidLat, 7),
      centroid_lon: round(c.centroidLng, 7),
      source_url: FRESNO_LAYER,
      gross_acres: round(c.acres, 1),
    };
    parcels.push({ base, enrichment });
    console.log(
      `  ${c.apn.padEnd(11)} ${c.acres.toFixed(1).padStart(6)} ac  ` +
        `crop=${enrichment.crop?.value ?? "(rep)"}  gsa=${enrichment.gsa_name?.value ?? "-"}  ` +
        `wd=${enrichment.water_district?.value ?? "-"}  soil=${enrichment.soil_class?.value ?? "-"}`,
    );
  }

  const fixture: FarmFixture = {
    generatedAt: new Date().toISOString(),
    name: FARM_NAME,
    county: "Fresno",
    center: CENTER,
    parcels,
  };
  const out = join(process.cwd(), "fixtures", OUT_FILE);
  writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${parcels.length} parcels -> ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
