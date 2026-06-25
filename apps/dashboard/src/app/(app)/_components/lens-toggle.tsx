"use client";

import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { LENSES, SURFACE, lensQueryOptions, parseLens } from "@/lib/dashboard/surface";

// The lens toggle: one shadcn Tabs control over one meter dataset, one lens visible at a time.
// Reads/writes only the nuqs `lens` key, so switching a lens never drops the active filter or the
// open `meter` drawer (those keys are untouched). The lens CONTENT is rendered by the page from the
// same nuqs key, so this owns only the tab row (no TabsContent here). Unavailable lenses render a
// disabled trigger with a "coming" tag, like the future agents. Triggers are >= 44px tall (the
// accessibility tap-target floor).
export function LensToggle() {
  const [raw, setLens] = useQueryState(SURFACE.lens, lensQueryOptions());
  const active = parseLens(raw);

  return (
    <Tabs
      value={active}
      onValueChange={(value) => void setLens(value)}
      aria-label={en.shell.lensLabel}
    >
      {/* `line` variant: a clean underline tab row - transparent (no grey active pill), one bottom
          hairline, no per-trigger borders, no horizontal scrollbar. The active indicator is the
          primitive's ::after underline, recolored to the brand green. */}
      <TabsList
        variant="line"
        className="h-auto w-full justify-start gap-4 rounded-none border-b border-outline-variant bg-transparent p-0"
      >
        {LENSES.map(({ key, available }) => (
          <TabsTrigger
            key={key}
            value={key}
            disabled={!available}
            className="h-11 flex-none gap-1.5 px-1 type-label-caps text-on-surface-variant data-active:font-semibold data-active:text-primary [&::after]:bottom-[-1px] [&::after]:bg-primary"
          >
            <span>{en.shell.lens[key]}</span>
            {!available && (
              <span className="type-label-caps text-on-surface-variant/50">{en.shell.comingTag}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
