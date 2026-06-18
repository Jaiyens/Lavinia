"use client";

import { useCallback } from "react";
import { useQueryState } from "nuqs";
import { SURFACE, lensQueryOptions, type Lens } from "@/lib/dashboard/surface";
import type { NavigateAction } from "@/lib/almond/skills/navigate";

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

export function useAlmondNavigation(): { apply: (action: NavigateAction) => void } {
  const [, setLens] = useQueryState(SURFACE.lens, lensQueryOptions());
  const [, setEntity] = useQueryState(SURFACE.entity);
  const [, setRanch] = useQueryState(SURFACE.ranch);
  const [, setRate] = useQueryState(SURFACE.rate);
  const [, setMeter] = useQueryState(SURFACE.meter);

  return {
    apply: useCallback(
      (action: NavigateAction) => {
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
      },
      [setLens, setEntity, setRanch, setRate, setMeter],
    ),
  };
}
