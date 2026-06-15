"use client";

import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
import { defaultLens, parseLens } from "@/lib/dashboard/lens";
import type { MeterView } from "@/lib/dashboard/load";
import type { MeterReadSchedule } from "@/lib/pge/schedule";
import { MeterTable } from "./meter-table";
import { ChartLens } from "./chart-lens";
import { MapLens } from "./map-lens";
import { CalendarLens } from "./calendar-lens";

// The active-lens region. Reads the same nuqs `lens` key as the toggle and shows one lens at a
// time over the single meter dataset: Chart (2.8), Table (2.4), Map (2.9), Calendar (3.5). The
// read schedule is loaded server-side (fs) and passed down for the Calendar's scheduled marks.
// The scroll target `id="energy-lens"` (the KPI cards scroll to it) lives on whichever view
// renders.
export function LensRegion({
  meters,
  schedule,
  todayIso,
}: {
  meters: MeterView[];
  schedule: MeterReadSchedule;
  todayIso: string;
}) {
  const [raw] = useQueryState("lens", {
    defaultValue: defaultLens(),
    clearOnDefault: true,
  });
  const active = parseLens(raw);

  if (active === "chart") {
    return <ChartLens meters={meters} />;
  }

  if (active === "table") {
    return <MeterTable meters={meters} />;
  }

  if (active === "map") {
    return <MapLens meters={meters} />;
  }

  if (active === "calendar") {
    return <CalendarLens meters={meters} schedule={schedule} todayIso={todayIso} />;
  }

  const label = en.shell.lens[active];
  return (
    <section
      id="energy-lens"
      aria-label={label}
      aria-live="polite"
      className="flex min-h-[16rem] scroll-mt-6 items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8"
    >
      <p className="type-body-md text-on-surface-variant">{en.shell.lensComing}</p>
    </section>
  );
}
