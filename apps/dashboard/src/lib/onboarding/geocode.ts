// Address -> map pin. Onboarding pre-places a rough pin from each meter's ESPI
// ServiceLocation address; the farmer then drags it to the real spot. This is a
// stubbed boundary: a real geocoder needs a network call, which the repo forbids
// in dev/test, so we derive a STABLE pseudo-location from the address text instead.
// Deterministic (same address -> same pin) so onboarding is idempotent and tests
// are exact. Pure: no fs, no network, no clock.
//
// TODO: swap this for a real geocoder (PG&E ServiceLocation lat/lng when available,
// else a geocoding API). Callers (src/lib/onboarding/farm.ts) are unaffected.

// Madera County, CA, the sample farm's region. Pins scatter within a plausible
// county-sized box around it; the farmer corrects the exact spot in the confirm step.
const MADERA_CENTER = { lat: 36.96, lng: -120.06 };
const LAT_SPREAD = 0.22; // ~15 miles north/south
const LNG_SPREAD = 0.28; // ~15 miles east/west

export type LatLng = { lat: number; lng: number };

// FNV-1a, a tiny stable string hash. Math.imul keeps it 32-bit and deterministic.
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * A rough, deterministic pin for an address, within a Madera-County-sized box.
 * Returns null for a missing/blank address (the pin then starts at the box center
 * in the UI). Not a real geocode, see the file header.
 */
export function geocodeAddress(address: string | null | undefined): LatLng | null {
  if (!address || address.trim() === "") return null;
  const key = address.trim().toLowerCase();
  // Two independent unit floats in [0,1] from one address, for lat and lng.
  const u1 = hash32(key) / 0xffffffff;
  const u2 = hash32(`${key}::lng`) / 0xffffffff;
  return {
    lat: round5(MADERA_CENTER.lat + (u1 - 0.5) * 2 * LAT_SPREAD),
    lng: round5(MADERA_CENTER.lng + (u2 - 0.5) * 2 * LNG_SPREAD),
  };
}

/** The map's default center, used when no address resolves. */
export function defaultCenter(): LatLng {
  return { ...MADERA_CENTER };
}

/** The county-box half-extents the schematic map normalizes pins against. */
export const MAP_BOUNDS = {
  center: MADERA_CENTER,
  latSpread: LAT_SPREAD,
  lngSpread: LNG_SPREAD,
} as const;
