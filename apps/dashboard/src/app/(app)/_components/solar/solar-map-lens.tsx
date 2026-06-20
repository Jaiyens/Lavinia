"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import { toMapPins } from "@/lib/dashboard/map";
import { isTrueUpSoon } from "@/lib/dashboard/solar";
import { SURFACE } from "@/lib/dashboard/surface";
import { MeterMap } from "../meter-map";

// The solar Map lens (A-6, FR35, UX-DR6): the solar fleet placed geographically, reusing the shared
// <MeterMap> (maplibre) UNCHANGED in mechanics - the heavy basemap/marker wiring lives there once
// (also used by the Energy map lens and the Home hero), this component owns only the solar chrome.
//
// Launch-data pins ONLY (UX-DR6): every SOLAR meter with a real lat/long renders a pin encoding the
// three signals already on the meter at launch (FR35):
//   1. coverage state - the needs-a-look (clay) vs looks-calm (green) hue, from toMapPins's attention,
//   2. that the meter is on solar - the placed set is pre-filtered to isSolar, so the whole map is solar,
//   3. true-up soon - a quiet ring around the dot when the meter's annual settle is within the next
//      few months (the same clock-free window the dataset's next-true-up KPI uses, via isTrueUpSoon).
// The plain-word legend pairs each signal with words, and a labeled list also names the true-up-soon
// meters so the ring's meaning is readable, not conveyed by the outline alone. There is deliberately
// NO array-health pin: no backing array-health field exists at launch, so encoding one would be a
// fabricated signal (the one law: never guess a datum that is not in the data). A solar meter with no
// resolvable lat/long is NEVER placed at a guessed location - it is listed honestly in the "no
// location yet" tray (and in the Table lens, A-8), never dropped, never pinned at a fake point.
//
// HONEST-BLANK discipline: the solar map carries NO dollar (showBill is off). A true-up credit
// dollar is honest-blank until a statement is on file (Epic G), so floating a number above a solar
// pin would fabricate a credit - the pin shows a status dot, never a dollar. The true-up-soon ring is
// a TIMING signal (a date that is in the data), never a dollar.
//
// Tapping a pin (or a tray row) opens the shared drawer to that meter's solar section via the same
// SURFACE.meter nuqs key the Arrays lens and the Energy map use, so a tapped meter behaves
// identically wherever it is opened.

const t = en.solar.map;

export function SolarMapLens({ meters, nowMonth }: { meters: MeterView[]; nowMonth: number }) {
  const [meterId, setMeter] = useQueryState(SURFACE.meter);

  // Solar-only pins: the map places the solar fleet, not the whole farm. Filtering to isSolar BEFORE
  // toMapPins means every placed pin is a solar meter (so the legend's "on solar" reading holds for
  // the whole set), and toMapPins splits real-located meters (pins) from the no-location tray. We then
  // stamp the true-up-soon dimension onto each pin (additive; the shared toMapPins stays untouched),
  // and collect the located-or-not true-up-soon meters so they are also named in a labeled list.
  const { pins, unlocated, trueUpSoonMeters } = useMemo(() => {
    const solar = meters.filter((m) => m.isSolar);
    const soonById = new Map(
      solar
        .filter((m) => isTrueUpSoon(m.trueUpMonth, nowMonth))
        .map((m) => [m.id, m.name] as const),
    );
    const base = toMapPins(solar);
    return {
      pins: base.pins.map((p) => ({ ...p, trueUpSoon: soonById.has(p.meterId) })),
      unlocated: base.unlocated,
      // Named in a stable order (the loader already name-sorts the meter set).
      trueUpSoonMeters: [...soonById.entries()].map(([id, name]) => ({ id, name })),
    };
  }, [meters, nowMonth]);

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
        {/* The third launch signal (FR35): the true-up-soon ring. Shown as a dot wearing the same
            outline the marker draws, so the legend entry mirrors the pin, never a hue of its own. */}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-on-surface-variant outline outline-2 outline-offset-2 outline-on-surface"
          />
          <span className="type-caption text-on-surface-variant">{t.trueUpSoon}</span>
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

      {/* The true-up-soon list (FR35): names the solar meters whose annual settle is within the next
          few months, so the ring on the map is also present as words (color/outline is never the only
          signal). Located OR not, every true-up-soon solar meter is named here. */}
      {trueUpSoonMeters.length > 0 && (
        <details className="group mt-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 type-body-md text-on-surface">
            <span>{t.trueUpSoonSummary(trueUpSoonMeters.length)}</span>
            <ChevronDown
              size={18}
              aria-hidden
              className="shrink-0 text-on-surface-variant transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="border-t border-outline-variant">
            {trueUpSoonMeters.map((m) => (
              <li key={m.id} className="border-t border-outline-variant first:border-t-0">
                <button
                  type="button"
                  onClick={() => void setMeter(m.id)}
                  aria-label={t.openMeter(m.name)}
                  className="flex min-h-[44px] w-full items-center px-4 py-2 text-left type-body-md text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

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
                  aria-label={t.openMeter(u.name)}
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
