"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import { filterMeters } from "@/lib/dashboard/table";
import { toMapPins } from "@/lib/dashboard/map";
import {
  RATE_FAMILY_COLOR,
  RATE_FAMILY_ORDER,
  rateFamily,
  type RateFamily,
} from "@/lib/dashboard/map-style";
import type { ParcelOverlay } from "@/lib/dashboard/parcel-overlay";
import { SURFACE } from "@/lib/dashboard/surface";
import { isActiveFilterValue } from "./filter-bar";
import { MeterMap } from "./meter-map";

// The Map lens (Story 2.9, FR-12): read-only map over the canonical inventory. The heavy
// maplibre rendering now lives in the shared <MeterMap> (also used by the Home hero); this
// component owns the lens chrome - the filter wiring (nuqs), the pin-color legend, the open
// meter (the drawer's `meter` key), and the honest "no location yet" tray. Pins carry the
// latest bill so it floats above each reconciled meter, exactly like the Home map.

const t = en.shell.map;

export function MapLens({
  meters,
  parcels = null,
}: {
  meters: MeterView[];
  parcels?: ParcelOverlay | null;
}) {
  const [entity, setEntity] = useQueryState(SURFACE.entity);
  const [ranch, setRanch] = useQueryState(SURFACE.ranch);
  const [rate, setRate] = useQueryState(SURFACE.rate);
  const [meterId, setMeter] = useQueryState(SURFACE.meter);

  const { pins, unlocated } = useMemo(
    () => toMapPins(filterMeters(meters, { entity, ranch, rate })),
    [meters, entity, ranch, rate],
  );

  // Only the rate families actually present in the current pin set appear in the legend (so a farm
  // with no commercial meters never shows a "Commercial" swatch), in the canonical legend order.
  const presentFamilies = useMemo(() => {
    const present = new Set<RateFamily>(pins.map((p) => rateFamily(p.rateSchedule)));
    return RATE_FAMILY_ORDER.filter((f) => present.has(f));
  }, [pins]);

  const hasView = meters.length > 0 && pins.length + unlocated.length > 0;

  if (!hasView) {
    const hasActiveFilter =
      isActiveFilterValue(entity) || isActiveFilterValue(ranch) || isActiveFilterValue(rate);
    const clearAll = () => {
      void setEntity(null);
      void setRanch(null);
      void setRate(null);
    };
    return (
      <div
        id="energy-lens"
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8"
      >
        <p className="type-body-md text-on-surface-variant">
          {meters.length === 0 ? en.shell.table.emptyFarm : t.emptyView}
        </p>
        {meters.length > 0 && hasActiveFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {en.shell.filter.clear}
          </button>
        )}
      </div>
    );
  }

  return (
    <section id="energy-lens" aria-label={t.caption} className="scroll-mt-6">
      {/* Rate-family legend: color always paired with its label (color is never the only signal).
          Two notes carry the other two encoded dimensions - the legacy ring and the spend size. */}
      <div className="mb-3 flex flex-col gap-1.5">
        <ul
          aria-label={t.rateLegendLabel}
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          {presentFamilies.map((family) => (
            <li key={family} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border border-outline-variant"
                style={{ background: RATE_FAMILY_COLOR[family] }}
              />
              <span className="type-caption text-on-surface-variant">{t.rateFamily[family]}</span>
            </li>
          ))}
        </ul>
        <p className="type-caption text-on-surface-variant">
          {t.ringNote} {"·"} {t.sizeNote}
        </p>
      </div>

      {/* No bill chips here: a $ label on every pin was too cluttered. The pin's COLOR (rate) and
          SIZE (annual spend) carry the at-a-glance read; the exact dollars are on the hover popup. */}
      <MeterMap
        pins={pins}
        openMeterId={meterId}
        onOpen={(id) => void setMeter(id)}
        encoding="rate"
        parcels={parcels}
        heightClass="h-[360px]"
      />

      {/* The honest tray: every meter without a resolvable location, opener included. */}
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
                  aria-label={en.shell.table.openMeter(u.name)}
                  className="flex min-h-[44px] w-full items-center px-4 py-2 text-left type-body-md text-on-surface hover:bg-surface-container-low"
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
