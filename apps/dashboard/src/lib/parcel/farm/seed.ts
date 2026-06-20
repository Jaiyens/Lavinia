// Loads the seeded representative farm. The committed fixture holds only the parts that need the
// network (real parcel geometry from the county + baked live enrichment); the full operational
// model is regenerated deterministically at render time (representative.ts), so relative dates
// (lease expiry, overdue tasks) stay current without re-baking. Server-only; reads the fixture
// from process.cwd() per the repo's runtime-fixture convention (shipped via
// outputFileTracingIncludes in next.config.ts).

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

export type RepresentativeFarmFixture = {
  /** ISO timestamp the fixture was generated (provenance only). */
  generatedAt: string;
  name: string;
  county: string;
  center: { lat: number; lng: number };
  parcels: FixtureParcel[];
};

const FIXTURE_PATH = join(process.cwd(), "fixtures", "representative-farm.json");

function readFixture(): RepresentativeFarmFixture {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as RepresentativeFarmFixture;
}

/**
 * The seeded representative operation, with every block's full farm-ops data built fresh for
 * `todayIso` (the grower's Pacific date). Request-cached so the page and any sibling reads share
 * one build.
 */
export const loadRepresentativeFarm = cache((todayIso: string): Farm => {
  const fixture = readFixture();
  const parcels = fixture.parcels.map((p, i) => buildFarmParcel(p.base, p.enrichment, i, todayIso));
  return {
    name: fixture.name,
    county: fixture.county,
    parcels,
    representative: true,
  };
});
