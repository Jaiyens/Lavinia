"use client";

import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
import { SURFACE } from "@/lib/dashboard/surface";
import { parseSolarLens, solarLensQueryOptions } from "@/lib/solar/lens-solar";

// The active solar-lens region scaffold (A-2). Reads the same nuqs `lens` key as the toggle, against
// the SOLAR registry, and shows one lens at a time over the solar-filtered meter dataset: Arrays
// (default, the aggregation map), Calendar, Map, Table. A-2 ships the scaffold only — each lens
// renders an empty-but-structured placeholder labelled with the active lens; the real views arrive in
// later stories (Arrays A-5, Map A-6, Table A-8, Calendar Epic D). Switching the toggle swaps which
// placeholder shows here, never a crash or a blank region. `aria-live` announces the swap; the region
// is labelled with the active lens so the structure is whole and accessible from A-2 onward.
export function SolarLensRegion() {
  const [raw] = useQueryState(SURFACE.lens, solarLensQueryOptions());
  const active = parseSolarLens(raw);
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
