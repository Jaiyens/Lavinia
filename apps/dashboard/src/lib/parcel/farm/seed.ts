// Loads a seeded farm fixture. A committed fixture holds only the parts that need the network (real
// parcel geometry from the county + baked live enrichment); the full operational model is regenerated
// deterministically at render time (representative.ts), so relative dates (lease expiry, overdue
// tasks) stay current without re-baking. Server-only; reads the fixture from process.cwd() per the
// repo's runtime-fixture convention (shipped via outputFileTracingIncludes in next.config.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import type { Farm } from "./types";
import { buildFarmParcel, type EngineParcel, type Enrichment } from "./representative";

/** One baked parcel: the real engine facts + whatever we genuinely auto-enriched. */
export type FixtureParcel = {
  base: EngineParcel;
  enrichment: Enrichment;
};

export type FarmFixture = {
  /** ISO timestamp the fixture was generated (provenance only). */
  generatedAt: string;
  name: string;
  county: string;
  center: { lat: number; lng: number };
  parcels: FixtureParcel[];
};

/** Back-compat alias for the original representative-farm fixture type. */
export type RepresentativeFarmFixture = FarmFixture;

function readFixture(fileName: string): FarmFixture {
  const raw = readFileSync(join(process.cwd(), "fixtures", fileName), "utf8");
  return JSON.parse(raw) as FarmFixture;
}

/** Build a Farm from a committed fixture, with every block's ops data built fresh for `todayIso`. */
function buildFarm(fixture: FarmFixture, todayIso: string): Farm {
  const parcels = fixture.parcels.map((p, i) => buildFarmParcel(p.base, p.enrichment, i, todayIso));
  return { name: fixture.name, county: fixture.county, parcels, representative: true };
}

/**
 * The seeded representative operation ("Cordova Ranches"), built fresh for `todayIso` (the grower's
 * Pacific date). Request-cached so the page and any sibling reads share one build.
 */
export const loadRepresentativeFarm = cache((todayIso: string): Farm =>
  buildFarm(readFixture("representative-farm.json"), todayIso),
);

/**
 * The demo operation shown on the Parcels surface ("Sundance Valley Farms"): SYNTHETIC parcels in
 * Fresno County, relocated to open farmland with synthetic APNs by scripts/relocate-demo-parcels.ts
 * so the demo never displays a real grower's land or APN. Falls back to the representative fixture if
 * the demo fixture isn't present (so the app never hard-fails on a missing seed). Request-cached.
 */
export const loadDemoFarm = cache((todayIso: string): Farm => {
  try {
    return buildFarm(readFixture("sundance-parcels.json"), todayIso);
  } catch {
    return loadRepresentativeFarm(todayIso);
  }
});
