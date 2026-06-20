// The SOLAR lens registry. One solar-filtered meter dataset, shown one lens at a time, switched by
// the same nuqs `lens` URL key the Energy surface uses (SURFACE.lens), but resolved through THIS
// registry on /solar. Pure + tested so the solar toggle, the page, and any deep link (and Almond's
// navigate skill, once extended for surface: "solar", ADR-S09) agree on what is selectable and what
// the default is.
//
// This is a dedicated registry, mirroring lens.ts's shape, NOT a reuse of the energy lens registry
// (ADR-S02): the two datasets keep their defaults and availability independent. The energy registry
// defaults to Table; the solar registry defaults to ARRAYS, because the array-to-meter aggregation
// map is the at-a-glance wedge (UX-A2). A modest duplication (two small lens registries) is the
// accepted cost; a shared parameterized registry is a recorded later refactor (ARCH-A3).

export type SolarLens = "arrays" | "calendar" | "map" | "table";

type SolarLensDef = {
  key: SolarLens;
  /** True once the lens's content exists. Unavailable lenses render a "coming" placeholder and are
      non-interactive, like the future agents in the rail and the not-yet-shipped energy lenses. */
  available: boolean;
};

// Priority order = the order the default-picker walks. ARRAYS is first (the default): the
// aggregation map is the wedge surface the grower opens the tab for ("show me my solar"), the
// at-a-glance win the PRD leads with (UX-A2). Calendar second (the annual true-up heartbeat), then
// Map and Table behind a tap. The Arrays default OVERRIDES the Energy Table-first default on
// purpose; flipping to Table-first if grower testing prefers it is a one-line reorder here.
export const SOLAR_LENSES: readonly SolarLensDef[] = [
  { key: "arrays", available: true },
  { key: "calendar", available: true },
  { key: "map", available: true },
  { key: "table", available: true },
] as const;

export const SOLAR_LENS_KEYS: readonly SolarLens[] = SOLAR_LENSES.map((l) => l.key);

/** The default solar lens (first available in priority order): Arrays, the aggregation-map wedge. */
export function defaultSolarLens(): SolarLens {
  const first = SOLAR_LENSES.find((l) => l.available);
  // The registry invariant is that at least one lens is available; "arrays" is the honest ultimate
  // fallback (never a knowingly-unavailable lens) if that invariant is ever broken.
  return first ? first.key : "arrays";
}

export function isSolarLensAvailable(key: SolarLens): boolean {
  return SOLAR_LENSES.find((l) => l.key === key)?.available ?? false;
}

/**
 * Resolve a raw URL value to a real, AVAILABLE solar lens. Unknown, absent, or not-yet-available
 * values fall back to the default (Arrays), so a stale deep link never strands the grower on a blank
 * view.
 */
export function parseSolarLens(value: string | null | undefined): SolarLens {
  const hit = SOLAR_LENSES.find((l) => l.key === value && l.available);
  return hit ? hit.key : defaultSolarLens();
}

/**
 * nuqs options for the `lens` key on /solar. A function (not a frozen object) so `defaultSolarLens()`
 * is read at render time and tracks lens availability as solar lenses ship or retire here. Mirrors
 * the energy `lensQueryOptions` shape (defaultValue + clearOnDefault) so the default solar lens is
 * cleared from the URL exactly as the energy lens default is.
 */
export function solarLensQueryOptions(): { defaultValue: SolarLens; clearOnDefault: boolean } {
  return { defaultValue: defaultSolarLens(), clearOnDefault: true };
}
