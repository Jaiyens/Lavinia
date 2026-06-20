"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import { toMapPins } from "@/lib/dashboard/map";
import { SURFACE } from "@/lib/dashboard/surface";
import { MeterMap } from "../meter-map";

// The solar Map lens (A-6, FR35, UX-DR6): the solar fleet placed geographically, reusing the shared
// <MeterMap> (maplibre) UNCHANGED in mechanics - the heavy basemap/marker wiring lives there once
// (also used by the Energy map lens and the Home hero), this component owns only the solar chrome.
//
// Launch-data pins ONLY (UX-DR6): every SOLAR meter with a real lat/long renders a pin; the pin
// encodes the launch signals already on the meter (coverage state, that it is on solar, true-up
// soon), with a plain-word legend. There is deliberately NO array-health pin: no backing
// array-health field exists at launch, so encoding one would be a fabricated signal (the one law:
// never guess a datum that is not in the data). A solar meter with no resolvable lat/long is NEVER
// placed at a guessed location - it is listed honestly in the "no location yet" tray (and in the
// Table lens, A-8), never dropped, never pinned at a fake point.
//
// HONEST-BLANK discipline: the solar map carries NO dollar (showBill is off). A true-up credit
// dollar is honest-blank until a statement is on file (Epic G), so floating a number above a solar
// pin would fabricate a credit - the pin shows a status dot, never a dollar.
//
// Tapping a pin (or a tray row) opens the shared drawer to that meter's solar section via the same
// SURFACE.meter nuqs key the Arrays lens and the Energy map use, so a tapped meter behaves
// identically wherever it is opened.

const t = en.solar.map;

export function SolarMapLens({ meters }: { meters: MeterView[] }) {
  const [meterId, setMeter] = useQueryState(SURFACE.meter);

  // Solar-only pins: the map places the solar fleet, not the whole farm. Filtering to isSolar BEFORE
  // toMapPins means every placed pin is a solar meter (so the legend's "on solar" reading holds for
  // the whole set), and toMapPins splits real-located meters (pins) from the no-location tray.
  const { pins, unlocated } = useMemo(
    () => toMapPins(meters.filter((m) => m.isSolar)),
    [meters],
  );

  const hasView = pins.length + unlocated.length > 0;

  if (!hasView) {
    return (
      <section
        id="solar-lens"
        aria-label={en.solar.lens.map}
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center"
      >
        <p className="type-body-md text-on-surface-variant">{t.emptyView}</p>
      </section>
    );
  }

  return (
    <section id="solar-lens" aria-label={en.solar.lens.map} className="scroll-mt-6">
      {/* Pin legend (UX-DR6): plain words, color always paired with its label. No array-health entry,
          because no array-health pin is encoded. */}
      <ul
        aria-label={t.legendLabel}
        className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-outline-variant"
            style={{ background: "var(--alert)" }}
          />
          <span className="type-caption text-on-surface-variant">{t.attention}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-outline-variant"
            style={{ background: "var(--primary)" }}
          />
          <span className="type-caption text-on-surface-variant">{t.calm}</span>
        </li>
      </ul>

      {/* The shared map, reused unchanged. showBill is OFF: no dollar floats above a solar pin
          (honest-blank - a true-up credit is not on file until a statement settles it). */}
      <MeterMap
        pins={pins}
        openMeterId={meterId}
        onOpen={(id) => void setMeter(id)}
        heightClass="h-[360px]"
      />

      {/* The honest tray: every solar meter without a resolvable location, listed not placed. */}
      {unlocated.length > 0 && (
        <details className="group mt-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 type-body-md text-on-surface">
            <span>{t.traySummary(unlocated.length)}</span>
            <ChevronDown
              size={18}
              aria-hidden
              className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="border-t border-outline-variant">
            {unlocated.map((u) => (
              <li key={u.meterId} className="border-t border-outline-variant first:border-t-0">
                <button
                  type="button"
                  onClick={() => void setMeter(u.meterId)}
                  aria-label={en.solar.arrays.openMeter(u.name)}
                  className="flex min-h-[44px] w-full items-center px-4 py-2 text-left type-body-md text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
