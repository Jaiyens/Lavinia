"use client";

import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { LENSES, defaultLens, parseLens } from "@/lib/dashboard/lens";

// The lens toggle: one segmented control over one meter dataset, one lens visible at a time.
// Reads/writes only the nuqs `lens` key, so switching a lens never drops the active filter or
// the open `meter` drawer (those keys are untouched). The active tab carries the brand-green
// underline + weight (DESIGN.md). Unavailable lenses render a "coming" tag and are
// non-interactive, like the future agents. Announces the active lens for screen readers; tabs
// are >=44px tall (the accessibility tap-target floor).
export function LensToggle() {
  const [raw, setLens] = useQueryState("lens", {
    defaultValue: defaultLens(),
    clearOnDefault: true,
  });
  const active = parseLens(raw);

  return (
    <div
      role="tablist"
      aria-label={en.shell.lensLabel}
      className={cn(
        // overflow-x-auto: four live tabs since 3.5; a narrow phone scrolls the
        // row instead of clipping the last tab.
        "flex items-center gap-1 overflow-x-auto border-b border-outline-variant",
      )}
    >
      {LENSES.map(({ key, available }) => {
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
              "-mb-px flex h-11 items-center gap-1.5 border-b-2 px-3 type-label-caps transition-colors",
              isActive && "border-primary font-semibold text-primary",
              !isActive &&
                available &&
                "border-transparent text-on-surface-variant hover:text-on-surface",
              !available && "border-transparent text-on-surface-variant/45",
            )}
          >
            <span>{en.shell.lens[key]}</span>
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
