"use client";

import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
import { SURFACE } from "@/lib/dashboard/surface";
import { parseSolarLens, solarLensQueryOptions } from "@/lib/solar/lens-solar";
import type { SolarDataset } from "@/lib/dashboard/solar";
import type { MeterView } from "@/lib/dashboard/load";
import { ArraysLens } from "./arrays-lens";
import { SolarMapLens } from "./solar-map-lens";

// The active solar-lens region (A-2 scaffold, A-5 fills the Arrays view, A-6 the Map view). Reads the
// same nuqs `lens` key as the toggle, against the SOLAR registry, and shows one lens at a time over the
// solar dataset: Arrays (default, the aggregation map), Calendar, Map, Table. A-5 wires the Arrays lens
// (the default data hero); A-6 wires the Map lens (the solar fleet geographically); Table (A-8) and
// Calendar (Epic D) still render the empty-but-structured "coming" placeholder until their stories land.
// Switching the toggle swaps which view shows here, never a crash or a blank region. The Map lens reads
// the canonical MeterView[] (it needs lat/long, which the solar dataset's legibility view does not
// carry); it filters to solar meters itself. The placeholder branch keeps `aria-live` + the active-lens
// label so the structure stays whole and accessible for the not-yet-shipped lenses.

export function SolarLensRegion({
  dataset,
  meters,
}: {
  dataset: SolarDataset;
  meters: MeterView[];
}) {
  const [raw] = useQueryState(SURFACE.lens, solarLensQueryOptions());
  const active = parseSolarLens(raw);

  if (active === "arrays") {
    return <ArraysLens arrays={dataset.arrays} meters={dataset.meters} />;
  }

  if (active === "map") {
    return <SolarMapLens meters={meters} />;
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
