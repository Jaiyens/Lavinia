// Relocate the committed DEMO parcel fixtures to a synthetic location in Fresno County with synthetic
// APNs, so the demo's "Your parcels" map and the Parcels surface never sit on a real grower's land.
// It was first run against the real Batth Farms fixture (real parcels around Caruthers) to produce
// sundance-parcels.json; it now re-targets the demo fixtures in place, so you can retune a location
// by editing a JOBS `target` and re-running. This is a safety scrub: nothing in the demo should point
// at a parcel/APN that a real person owns.
//
// What is preserved EXACTLY:
//   - the parcel SHAPES: every coordinate is translated by a fixed offset, with an east-west
//     cos(latitude) correction so the polygons keep their true ground shape at the new latitude;
//   - the per-parcel CROP, hence the map colors + legend: representative.ts derives the displayed
//     crop from the APN for coarse land-use classes (an APN-seeded pick among candidates), so a new
//     APN could change the color. We therefore search APNs until the rebuilt planting.crop matches
//     what the parcel shows today, then verify the whole fixture round-trips to identical crops.
//
// What changes: the APNs (now synthetic, in an unused high book so they cannot collide with real
// Fresno APNs) and the location. The auto-enrichment (GSA, soil, water district, spray) is carried
// over unchanged as demo flavor.
//
// Run:  npx tsx scripts/relocate-demo-parcels.ts
// Rewrites fixtures/sundance-parcels.json and fixtures/representative-farm.json in place. Touches
// ONLY committed JSON fixtures + this script; it does NOT touch the database / Supabase.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFarmParcel } from "../src/lib/parcel/farm/representative";
import type { FarmFixture, FixtureParcel } from "../src/lib/parcel/farm/seed";
import type { ParcelGeometry, Position } from "../src/lib/parcel/types";

// Crop resolution is date-independent; any valid Pacific date works for the equality check.
const TODAY = "2026-06-25";
const cos = (latDeg: number): number => Math.cos((latDeg * Math.PI) / 180);

type LatLng = { lat: number; lng: number };

type Job = {
  src: string; // source fixture in fixtures/
  out: string; // output fixture in fixtures/ (may equal src to rewrite in place)
  name: string; // new farm name (must carry no real-client reference)
  target: LatLng; // where the cluster's centroid lands
  apnBook: string; // synthetic APN book prefix (high/unused -> cannot collide with real Fresno APNs)
};

// Two open-farmland targets in the Westlands belt of western Fresno County, well away from Caruthers
// (the real Batth home ranch) and from each other. Eyeball the rendered map and nudge these if a
// target lands on a town, canal, or fallow ground.
const JOBS: Job[] = [
  {
    src: "sundance-parcels.json",
    out: "sundance-parcels.json",
    name: "Sundance Valley Farms",
    target: { lat: 36.475, lng: -120.24 }, // Five Points / Cantua Creek farmland
    apnBook: "90",
  },
  {
    src: "representative-farm.json",
    out: "representative-farm.json",
    name: "Cordova Ranches", // already synthetic; keep the name, move the land
    target: { lat: 36.66, lng: -120.18 }, // Tranquillity / Helm farmland
    apnBook: "91",
  },
];

function clusterCentroid(fx: FarmFixture): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of fx.parcels) {
    lat += p.base.centroid_lat;
    lng += p.base.centroid_lon;
  }
  return { lat: lat / fx.parcels.length, lng: lng / fx.parcels.length };
}

type Move = (lng: number, lat: number) => Position;

function translator(anchor: LatLng, target: LatLng): Move {
  const kLng = cos(anchor.lat) / cos(target.lat); // keep true east-west ground scale at the new latitude
  return (lng, lat) => [target.lng + (lng - anchor.lng) * kLng, target.lat + (lat - anchor.lat)];
}

function moveGeometry(geom: ParcelGeometry, move: Move): ParcelGeometry {
  const ring = (r: Position[]): Position[] => r.map(([lng, lat]) => move(lng, lat));
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map(ring) };
  }
  return { type: "MultiPolygon", coordinates: geom.coordinates.map((poly) => poly.map(ring)) };
}

/** The crop representative.ts would display for this parcel under the given APN (drives the color). */
function cropFor(apn: string, p: FixtureParcel): string {
  return buildFarmParcel({ ...p.base, apn }, p.enrichment, 0, TODAY).planting.crop;
}

function relocate(job: Job): void {
  const fx = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", job.src), "utf8"),
  ) as FarmFixture;
  const move = translator(clusterCentroid(fx), job.target);
  const used = new Set<string>();

  const parcels: FixtureParcel[] = fx.parcels.map((p, i) => {
    const wantCrop = cropFor(p.base.apn, p); // the crop (=> color) the parcel shows today
    let newApn = "";
    // Each parcel draws from a disjoint sequence block; we walk it until the rebuilt crop matches.
    for (let seq = i * 1000; seq < i * 1000 + 100_000 && !newApn; seq++) {
      const cand = `${job.apnBook}${String(seq).padStart(6, "0")}S`;
      if (!used.has(cand) && cropFor(cand, p) === wantCrop) newApn = cand;
    }
    if (!newApn) throw new Error(`no color-preserving APN found for ${p.base.apn} (${wantCrop})`);
    used.add(newApn);

    const [lng, lat] = move(p.base.centroid_lon, p.base.centroid_lat);
    return {
      base: {
        ...p.base,
        apn: newApn,
        county: "Fresno",
        geometry: moveGeometry(p.base.geometry, move),
        centroid_lat: Number(lat.toFixed(7)),
        centroid_lon: Number(lng.toFixed(7)),
      },
      enrichment: p.enrichment,
    };
  });

  const out: FarmFixture = {
    generatedAt: new Date().toISOString(),
    name: job.name,
    county: "Fresno",
    center: { ...job.target },
    parcels,
  };
  writeFileSync(join(process.cwd(), "fixtures", job.out), `${JSON.stringify(out, null, 2)}\n`);

  // Verify the OUTPUT fixture rebuilds to the same crop set (same colors + legend) as the source.
  const before = fx.parcels.map((p) => cropFor(p.base.apn, p));
  const after = parcels.map((p) => cropFor(p.base.apn, p));
  const mismatches = after.filter((c, i) => c !== before[i]).length;

  console.log(`\n${job.src} -> ${job.out}   "${job.name}"   center ${job.target.lat}, ${job.target.lng}`);
  parcels.forEach((p, i) => {
    console.log(`  ${fx.parcels[i]!.base.apn.padEnd(11)} -> ${p.base.apn.padEnd(11)}  ${after[i]}`);
  });
  console.log(
    mismatches === 0
      ? `  OK  ${parcels.length} parcels relocated, crops/colors identical`
      : `  FAIL  ${mismatches} crop/color mismatch(es)`,
  );
  if (mismatches > 0) process.exitCode = 1;
}

for (const job of JOBS) relocate(job);
