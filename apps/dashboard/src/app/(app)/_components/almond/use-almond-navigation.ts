"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { SURFACE, lensQueryOptions, type Lens } from "@/lib/dashboard/surface";
<<<<<<< HEAD
import type { SolarLens } from "@/lib/solar/lens-solar";
import type { NavigateAction } from "@/lib/almond/skills/navigate";
=======
import type { MeterView } from "@/lib/dashboard/load";
import { filterMeters } from "@/lib/dashboard/table";
import { type NavigateAction, type NavState } from "@/lib/almond/skills/navigate";
>>>>>>> night/integration

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

/** The canonical URL-state setters, each typed to the value its key holds. `setLens` admits BOTH an
 *  energy `Lens` and a `SolarLens` (H-3): the `lens` URL key is shared across surfaces, and a solar
 *  navigate can now emit a `SolarLens` the resolver validated against `lens-solar.ts`. `setProgram`
 *  and `setAccount` are the two Solar-tab filter keys (A-7): raw nullable strings like
 *  `entity`/`ranch`/`rate`, so a solar navigate carrying `{program}`/`{account}` applies in place when
 *  the grower is already on `/solar`, exactly as the energy filters apply on `/energy`. */
export type NavigationSetters = {
  setLens: (value: Lens | SolarLens) => void;
  setEntity: (value: string | null) => void;
  setRanch: (value: string | null) => void;
  setRate: (value: string | null) => void;
  setAccount: (value: string | null) => void;
  setProgram: (value: string | null) => void;
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
  if (action.account !== undefined) setters.setAccount(action.account);
  if (action.program !== undefined) setters.setProgram(action.program);
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

/** The solar-surface path for the current shell, the sibling of `energyPathFor` (H-3, ADR-S09): a
 *  grower mid-Tour is routed to `/tour/solar`, never out of the Tour into `/solar`. This is the path a
 *  `surface: "solar"` action targets, so Almond's "point at it on the tab" actually opens the Solar
 *  tab (where `parseSolarLens` resolves a solar lens like `arrays`) instead of stranding the grower on
 *  the Energy table where the energy `parseLens` would coerce that lens to its default. */
export function solarPathFor(pathname: string | null): string {
  return pathname?.startsWith("/tour") ? "/tour/solar" : "/solar";
}

/** The path a `NavigateAction` targets: the solar surface for a `surface: "solar"` action, the energy
 *  surface otherwise (an absent `surface` is energy, the shipped default). Pure, so the apply branch
 *  and the deep-link path agree on one rule. */
export function pathForAction(action: NavigateAction, pathname: string | null): string {
  return action.surface === "solar" ? solarPathFor(pathname) : energyPathFor(pathname);
}

/** Serialize a `NavigateAction` into a deep-link query string over the canonical surface keys. A
 *  present key is written; a null/undefined key is omitted (a fresh deep link has nothing to clear,
 *  unlike the in-place setters where `null` actively clears a key). `surface` is NOT serialized: it
 *  selects the PATH (via `pathForAction`), it is not a URL-state key. `program` and `account` (the
 *  Solar-tab filters, A-7) ARE serialized, so a solar deep link carries them to `/solar`, where
 *  `solar-surface.tsx`'s nuqs consumers narrow the fleet on mount (ADR-S09). */
export function navigateActionToQuery(action: NavigateAction): string {
  const params = new URLSearchParams();
  if (action.lens != null) params.set(SURFACE.lens, action.lens);
  if (action.entity != null) params.set(SURFACE.entity, action.entity);
  if (action.ranch != null) params.set(SURFACE.ranch, action.ranch);
  if (action.rate != null) params.set(SURFACE.rate, action.rate);
  if (action.account != null) params.set(SURFACE.account, action.account);
  if (action.program != null) params.set(SURFACE.program, action.program);
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
  const [, setAccount] = useQueryState(SURFACE.account);
  const [, setProgram] = useQueryState(SURFACE.program);
  const [, setMeter] = useQueryState(SURFACE.meter);

  return {
    apply: useCallback(
      (action: NavigateAction) => {
        // The path the action targets: `/solar` (or `/tour/solar`) for a `surface: "solar"` action,
        // `/energy` (or `/tour/energy`) otherwise (H-3, ADR-S09). The `lens` URL key is shared, but
        // the surface around it is not: a solar `lens` like `arrays` is only honored on `/solar`,
        // where `parseSolarLens` resolves it; pushed to `/energy` the energy `parseLens` would coerce
        // it to the Table default and Almond would claim a surface it did not open.
        const targetPath = pathForAction(action, pathname);
        // Already on the action's target surface: apply in place via the canonical nuqs setters, so
        // the open/lens/filter happens with no reload, indistinguishable from a manual click. This is
        // the path that already worked for filtering on the Energy tab, and now also for the Solar
        // tab's lens/program/account filters when the grower is already on `/solar`.
        if (pathname === targetPath) {
          applyNavigateAction(
            {
              setLens: (value) => void setLens(value),
              setEntity: (value) => void setEntity(value),
              setRanch: (value) => void setRanch(value),
              setRate: (value) => void setRate(value),
              setAccount: (value) => void setAccount(value),
              setProgram: (value) => void setProgram(value),
              setMeter: (value) => void setMeter(value),
            },
            action,
          );
          return;
        }
        // Anywhere else (Home mounts neither the meter drawer nor the lens views; the Energy tab does
        // not mount the solar lens/filter consumers): route to the target surface carrying the action
        // as a deep link so its existing nuqs consumers open the drawer / switch the lens / filter on
        // mount. Same shared layout, so the panel + thread stay. `surface` selects the path, not a
        // query key, so it is never serialized into the deep link.
        const qs = navigateActionToQuery(action);
        router.push(qs ? `${targetPath}?${qs}` : targetPath);
      },
      [pathname, router, setLens, setEntity, setRanch, setRate, setAccount, setProgram, setMeter],
    ),
  };
}
