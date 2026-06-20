"use client";

import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
import { SURFACE } from "@/lib/dashboard/surface";
import { parseSolarLens, solarLensQueryOptions } from "@/lib/solar/lens-solar";
import type { SolarDataset } from "@/lib/dashboard/solar";
import type { MeterView } from "@/lib/dashboard/load";
import { ArraysLens } from "./arrays-lens";
import { SolarMapLens } from "./solar-map-lens";
import { SolarTableLens } from "./solar-table-lens";

// The active solar-lens region (A-2 scaffold, A-5 fills the Arrays view, A-6 the Map view). Reads the
// same nuqs `lens` key as the toggle, against the SOLAR registry, and shows one lens at a time over the
// solar dataset: Arrays (default, the aggregation map), Calendar, Map, Table. A-5 wires the Arrays lens
// (the default data hero); A-6 wires the Map lens (the solar fleet geographically); A-8 wires the Table
// lens (the Excel bridge + CSV export); Calendar (Epic D) still renders the empty-but-structured "coming"
// placeholder until its story lands.
// Switching the toggle swaps which view shows here, never a crash or a blank region. The Map lens reads
// the canonical MeterView[] (it needs lat/long, which the solar dataset's legibility view does not
// carry); it filters to solar meters itself. It is also handed the page-edge `nowMonth` so its
// true-up-soon pin signal (FR35) shares the dataset's clock-free window. The placeholder branch keeps `aria-live` + the active-lens
// label so the structure stays whole and accessible for the not-yet-shipped lenses.

export function SolarLensRegion({
  dataset,
  meters,
  nowMonth,
}: {
  dataset: SolarDataset;
  meters: MeterView[];
  /** The page-edge "now" month (1-12), injected so the Map lens's true-up-soon window stays
   *  clock-free and shares the same discipline as the dataset's next-true-up KPI (FR35, NFR1). */
  nowMonth: number;
}) {
  const [raw] = useQueryState(SURFACE.lens, solarLensQueryOptions());
  const active = parseSolarLens(raw);

  if (active === "arrays") {
    // The Arrays lens reads the SAME dataset.needsReview source the KPI count is computed from, so
    // the strip total and the rendered needs-review rows (unlinked meters + unlinked NEMA codes)
    // can never diverge (C-1, FR6). nameplateVerified drives the cautious "unverified layout"
    // qualifier on each array card's nameplate (DM4).
    return (
      <ArraysLens
        arrays={dataset.arrays}
        needsReview={dataset.needsReview}
        nameplateVerified={dataset.nameplateVerified}
      />
    );
  }

  if (active === "map") {
    return <SolarMapLens meters={meters} nowMonth={nowMonth} />;
  }

  if (active === "table") {
    // The Table lens reads the already-filter-narrowed MeterView[] (it needs coverage state and
    // array membership the dataset's legibility view does not carry); it filters to solar itself.
    return <SolarTableLens meters={meters} />;
  }

  const label = en.solar.lens[active];
  return (
    <section
      id="solar-lens"
      aria-label={label}
      aria-live="polite"
      className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center"
    >
      <p className="type-title text-on-surface">{label}</p>
      <p className="type-body-md text-on-surface-variant">{en.solar.lensComing}</p>
    </section>
  );
}
