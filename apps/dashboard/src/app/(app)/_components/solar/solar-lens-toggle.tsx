"use client";

import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { SURFACE } from "@/lib/dashboard/surface";
import {
  SOLAR_LENSES,
  parseSolarLens,
  solarLensQueryOptions,
} from "@/lib/solar/lens-solar";

// The solar lens toggle (A-2): one segmented control over one solar-filtered meter dataset, one
// lens visible at a time. Mirrors the Energy LensToggle but reads/writes the `lens` key against the
// SOLAR registry (lens-solar.ts) instead of the energy one, so the default face is Arrays and the
// value space is Arrays / Calendar / Map / Table.
//
// It writes ONLY the nuqs `lens` key (SURFACE.lens), so switching a lens never drops the active
// filter or the open `meter` drawer (those keys are untouched). The active tab carries the
// brand-green underline + weight (a {dur-base} colour/weight transition). Unavailable lenses render
// a "coming" tag and are non-interactive. Announces the active lens for screen readers; tabs are
// >=44px tall (h-11, the accessibility tap-target floor), and the row scrolls horizontally on a
// narrow phone (overflow-x-auto) rather than clipping a tab.
export function SolarLensToggle() {
  const [raw, setLens] = useQueryState(SURFACE.lens, solarLensQueryOptions());
  const active = parseSolarLens(raw);

  return (
    <div
      role="tablist"
      aria-label={en.solar.lensLabel}
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-outline-variant",
      )}
    >
      {SOLAR_LENSES.map(({ key, available }) => {
        const isActive = available && key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={available ? undefined : "true"}
            disabled={!available}
            onClick={() => available && void setLens(key)}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 type-label-caps transition-colors duration-[var(--dur-base)]",
              isActive && "border-primary font-semibold text-primary",
              !isActive &&
                available &&
                "border-transparent text-on-surface-variant hover:text-on-surface",
              !available && "border-transparent text-on-surface-variant/45",
            )}
          >
            <span>{en.solar.lens[key]}</span>
            {!available && (
              <span className="type-label-caps text-on-surface-variant/50">
                {en.shell.comingTag}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
