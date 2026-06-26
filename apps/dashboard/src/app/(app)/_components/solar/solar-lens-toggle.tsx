"use client";

import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
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
    <Tabs
      value={active}
      onValueChange={(value) => void setLens(value)}
      aria-label={en.solar.lensLabel}
    >
      {/* `line` variant: a clean underline tab row, recolored to the brand green. Mirrors the Energy
          LensToggle. The lens CONTENT is rendered by the page from the same nuqs key, so this owns
          only the tab row (no TabsContent here). */}
      <TabsList
        variant="line"
        className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-outline-variant bg-transparent p-0"
      >
        {SOLAR_LENSES.map(({ key, available }) => (
          <TabsTrigger
            key={key}
            value={key}
            disabled={!available}
            className="h-11 flex-none gap-1.5 px-3 type-label-caps text-on-surface-variant transition-colors duration-[var(--dur-base)] data-active:font-semibold data-active:text-primary [&::after]:bottom-[-1px] [&::after]:bg-primary"
          >
            <span>{en.solar.lens[key]}</span>
            {!available && (
              <span className="type-label-caps text-on-surface-variant/50">
                {en.shell.comingTag}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
