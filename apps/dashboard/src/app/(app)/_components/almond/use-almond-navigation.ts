"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { SURFACE, lensQueryOptions, type Lens } from "@/lib/dashboard/surface";
import type { MeterView } from "@/lib/dashboard/load";
import { filterMeters } from "@/lib/dashboard/table";
import { type NavigateAction, type NavState } from "@/lib/almond/skills/navigate";

/**
 * The client half of the server->client navigation bridge (Story 7.4).
 *
 * `useAlmondNavigation()` holds the dashboard's five canonical `useQueryState` setters — keyed from
 * the surface registry and mirroring the dashboard call-sites EXACTLY (only `lens` is parsed/defaulted;
 * `entity | ranch | rate | meter` are raw nullable strings) — so an action Almond applies is
 * indistinguishable from a manual click: the existing surfaces react in place, with no parallel
 * navigation UI and no reload (NFR4). It returns a stable `apply(action)`; the `AlmondLauncher` calls
 * it from `useChat`'s `onData` when a `data-navigate` part arrives, and Story 7.5's action chip calls
 * the same `apply` to link back. Must be used under the nuqs adapter (the launcher is). Navigation
 * only sets URL state, so it mutates no data (FR6).
 *
 * SURFACE-AWARENESS (open-meter / show-map fix): the meter drawer and the lens views are mounted
 * ONLY on the Energy dashboard (`/energy`, or `/tour/energy` on the public Tour). The Home overview
 * is a bento grid that consumes none of these keys, so setting `?meter=` / `?lens=` in place while on
 * Home moved nothing — "Open Westside Pump 17" and "Show me the map" silently failed. So when the
 * grower is NOT already on the energy surface, `apply` ROUTES there carrying the action as a deep
 * link (exactly how Home's own findings cards link via `?meter=`), and the energy page's existing
 * nuqs consumers open the drawer / switch the lens / filter on mount. Almond's provider + panel live
 * in the shared dashboard layout, so this client navigation keeps the conversation intact. When the
 * grower IS on energy, it keeps the original in-place apply (no reload) — the path that already
 * worked for filtering.
 */

/** The five canonical URL-state setters, each typed to the value its key holds. */
export type NavigationSetters = {
  setLens: (value: Lens) => void;
  setEntity: (value: string | null) => void;
  setRanch: (value: string | null) => void;
  setRate: (value: string | null) => void;
  setMeter: (value: string | null) => void;
};

/**
 * Apply a `NavigateAction` through the canonical setters. Pure (no hooks), so it is unit-testable
 * with mock setters. A present key is set; an explicit `null` clears it (e.g. `setMeter(null)` closes
 * the drawer); an ABSENT key is left untouched. The guard is `!== undefined`, never truthiness, so a
 * `null` clear is honored and an empty string is not mistaken for "no change".
 */
export function applyNavigateAction(setters: NavigationSetters, action: NavigateAction): void {
  if (action.lens !== undefined) setters.setLens(action.lens);
  if (action.entity !== undefined) setters.setEntity(action.entity);
  if (action.ranch !== undefined) setters.setRanch(action.ranch);
  if (action.rate !== undefined) setters.setRate(action.rate);
  if (action.meter !== undefined) setters.setMeter(action.meter);
}

/** The three filter keys the table reads (the nuqs entity/ranch/rate values currently in the URL). */
export type FilterState = { entity: string | null; ranch: string | null; rate: string | null };

/**
 * Merge a `NavigateAction` onto the CURRENT filter state exactly as the nuqs setters would, returning
 * the keys that would be in effect after `applyNavigateAction` runs. A present key (including a `null`
 * clear) overwrites; an ABSENT key is left at its current value. This is the same `!== undefined`
 * guard the setters use, so the merged state is what the URL — and therefore the table — will hold.
 */
export function mergeFilter(current: FilterState, action: NavigateAction): FilterState {
  return {
    entity: action.entity !== undefined ? action.entity : current.entity,
    ranch: action.ranch !== undefined ? action.ranch : current.ranch,
    rate: action.rate !== undefined ? action.rate : current.rate,
  };
}

/**
 * Compute the post-apply navigation state CLIENT-side: apply the action onto the current filter, then
 * read the result by running the SAME pure `filterMeters` the table runs over the meter list with the
 * merged keys (the verify-before-narrate seam, T5). Unlike the resolver's `stateForAction` — which
 * sees only the action's own keys — this also folds in any filter already active, so an additive
 * filter on top of an existing one reports the true combined count. Pure (no hooks), so it is unit
 * testable with a plain meter list. `openMeter` reflects the action's meter change, or the current
 * open meter when the action leaves the drawer untouched.
 */
export function navStateAfterApply(
  meters: readonly MeterView[],
  current: FilterState,
  action: NavigateAction,
  currentMeter: string | null = null,
): NavState {
  const merged = mergeFilter(current, action);
  return {
    visibleMeterCount: filterMeters(meters, merged).length,
    activeFilter: merged,
    openMeter: action.meter !== undefined ? action.meter : currentMeter,
  };
}

/** The energy-surface path for the current shell: the public Tour mirrors the live app one level
 *  deeper, so a grower mid-Tour is routed to `/tour/energy`, never out of the Tour into `/energy`. */
export function energyPathFor(pathname: string | null): string {
  return pathname?.startsWith("/tour") ? "/tour/energy" : "/energy";
}

/** Serialize a `NavigateAction` into a deep-link query string over the canonical surface keys. A
 *  present key is written; a null/undefined key is omitted (a fresh deep link has nothing to clear,
 *  unlike the in-place setters where `null` actively clears a key). */
export function navigateActionToQuery(action: NavigateAction): string {
  const params = new URLSearchParams();
  if (action.lens != null) params.set(SURFACE.lens, action.lens);
  if (action.entity != null) params.set(SURFACE.entity, action.entity);
  if (action.ranch != null) params.set(SURFACE.ranch, action.ranch);
  if (action.rate != null) params.set(SURFACE.rate, action.rate);
  if (action.meter != null) params.set(SURFACE.meter, action.meter);
  return params.toString();
}

export function useAlmondNavigation(): { apply: (action: NavigateAction) => void } {
  const pathname = usePathname();
  const router = useRouter();
  const [, setLens] = useQueryState(SURFACE.lens, lensQueryOptions());
  const [, setEntity] = useQueryState(SURFACE.entity);
  const [, setRanch] = useQueryState(SURFACE.ranch);
  const [, setRate] = useQueryState(SURFACE.rate);
  const [, setMeter] = useQueryState(SURFACE.meter);

  return {
    apply: useCallback(
      (action: NavigateAction) => {
        const energyPath = energyPathFor(pathname);
        // Already on the energy surface: apply in place via the canonical nuqs setters, so the
        // open/lens/filter happens with no reload, indistinguishable from a manual click. This is
        // the path that already worked for filtering on the Energy tab.
        if (pathname === energyPath) {
          applyNavigateAction(
            {
              setLens: (value) => void setLens(value),
              setEntity: (value) => void setEntity(value),
              setRanch: (value) => void setRanch(value),
              setRate: (value) => void setRate(value),
              setMeter: (value) => void setMeter(value),
            },
            action,
          );
          return;
        }
        // Anywhere else (Home mounts neither the meter drawer nor the lens views): route to the
        // energy surface carrying the action as a deep link so its existing nuqs consumers open the
        // drawer / switch the lens / filter on mount. Same shared layout, so the panel + thread stay.
        const qs = navigateActionToQuery(action);
        router.push(qs ? `${energyPath}?${qs}` : energyPath);
      },
      [pathname, router, setLens, setEntity, setRanch, setRate, setMeter],
    ),
  };
}
