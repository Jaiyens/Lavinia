// One-time seed: build the committed Batth Farms fixture from REAL Fresno County parcels around the
// Caruthers home ranch (5434 W Kamm Ave), auto-enriched from free public layers. Run:
//   npx tsx scripts/seed-batth-parcels.ts
// Writes apps/dashboard/fixtures/batth-parcels.json (real geometry + baked enrichment only; the
// operational model is regenerated at render time by representative.ts). Re-run to refresh.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { polygonAcresAndCentroid } from "../src/lib/parcel/geo";
import { enrichParcel } from "../src/lib/parcel/farm/enrich";
import type { EngineParcel } from "../src/lib/parcel/farm/representative";
import type { FarmFixture, FixtureParcel } from "../src/lib/parcel/farm/seed";
import type { ParcelGeometry, Position } from "../src/lib/parcel/types";

const FRESNO_LAYER =
  "https://services6.arcgis.com/Gs01XZPFhKUG8tKU/arcgis/rest/services/Fresno_County_Parcels/FeatureServer/0";
// Batth Farms HQ, geocoded: 5434 W Kamm Ave, Caruthers, Fresno County.
const CENTER = { lat: 36.532588, lng: -119.8871521 };
const HALF = 0.025; // ~2.5 km half-box around the home ranch, enough candidates to cluster from
const MIN_ACRES = 15; // ag-sized blocks, not rural-residential slivers
const MAX_PARCELS = 14;

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

  console.log("Fetching Fresno parcels around the Batth home ranch (Caruthers)...");
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

  // Take the ag blocks NEAREST the home ranch, for a tight, believable contiguous-ish operation.
  const chosen = [...byApn.values()].sort((a, b) => a.dist - b.dist).slice(0, MAX_PARCELS);
  console.log(
    `${fc.features.length} parcels in box -> ${chosen.length} ag blocks (>= ${MIN_ACRES} ac), nearest first.`,
  );

  const parcels: FixtureParcel[] = [];
  for (const c of chosen) {
    const enrichment = await enrichParcel(c.centroidLat, c.centroidLng, {
      geometry: c.geometry,
      acres: round(c.acres, 1),
      county: "Fresno",
    });
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
    name: "Batth Farms",
    county: "Fresno",
    center: CENTER,
    parcels,
  };
  const out = join(process.cwd(), "fixtures", "batth-parcels.json");
  writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${parcels.length} parcels -> ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
