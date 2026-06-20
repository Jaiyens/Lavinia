// The canonical dashboard surface registry.
//
// ONE source of truth for the dashboard's URL-state ("surface") keys. Before this file the five
// nuqs keys lived as bare string literals duplicated across ten client components, and only the
// lens VALUES were centralized (lens.ts). With the keys duplicated, a rename or a retired lens could
// silently desync the call-sites - and, once Almond can drive the screen (Epic 7), let the assistant
// offer a surface the dashboard no longer has. Both the dashboard's own `useQueryState` call-sites
// and Almond's `navigate` skill (Story 7.3) read their key (and, for `lens`, its parser + options)
// from here, so the navigable surface set has exactly one definition.
//
// The key set is CLOSED. Adding or retiring a surface is a one-line edit here; because the keys are
// `as const` literals reached through `SURFACE`, any consumer that references a removed surface
// fails at type-check, never silently at runtime.
//
// This file COMPOSES lens.ts (the lens-VALUE authority - the list of lenses and which are
// available); it does not replace it. It owns only the lens KEY, parser, and nuqs options.
//
// Two shapes are preserved verbatim from the pre-registry call-sites (Story 7.1 law: zero behavior
// change - do not add parsing or defaults the call-sites never had):
//   - `lens`   : parsed + defaulted to the simplest available lens, cleared from the URL on default.
//   - filters  : `entity | ranch | rate | meter` are raw nullable strings - no parser, no default.

import {
  LENSES,
  LENS_KEYS,
  defaultLens,
  isLensAvailable,
  parseLens,
  type Lens,
} from "@/lib/dashboard/lens";

// Re-export the lens-VALUE surface composed from lens.ts, so a consumer reasoning about what is
// navigable (the navigate skill, Story 7.3) has one import for both the keys and lens availability.
export { LENSES, LENS_KEYS, defaultLens, isLensAvailable, parseLens };
export type { Lens };

/** The closed set of canonical URL-state keys, in a stable order. `account` and `program` are the
 *  Solar tab's two net-new filter dimensions (A-7, FR1/UX5): `account` narrows by the PG&E account
 *  number (FR1 names account alongside entity/ranch, not exposed on the energy dashboard today),
 *  `program` by the net-metering program token. Both follow the raw-nullable-string filter pattern
 *  (no parser, no default), exactly like `entity`/`ranch`/`rate`. */
export const SURFACE_KEYS = ["lens", "entity", "ranch", "rate", "account", "program", "meter"] as const;

/** A canonical dashboard surface key; a value outside this union is not navigable. */
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

/**
 * The nuqs key for each canonical surface. `SURFACE.lens`, `SURFACE.entity`, ... are the literal key
 * strings a `useQueryState` call-site passes. Typed `Record<SurfaceKey, SurfaceKey>` so the map must
 * define exactly the key set: a key added to `SURFACE_KEYS` but not here (or removed from one and not
 * the other) is a compile error, and a consumer of a retired key fails at type-check.
 */
export const SURFACE = {
  lens: "lens",
  entity: "entity",
  ranch: "ranch",
  rate: "rate",
  account: "account",
  program: "program",
  meter: "meter",
} as const satisfies Record<SurfaceKey, SurfaceKey>;

/**
 * nuqs options for the `lens` key. A function (not a frozen object) so `defaultLens()` is read at
 * render time exactly as the shipped call-sites did - the default tracks lens availability as lenses
 * ship or retire in lens.ts.
 */
export function lensQueryOptions(): { defaultValue: Lens; clearOnDefault: boolean } {
  return { defaultValue: defaultLens(), clearOnDefault: true };
}
