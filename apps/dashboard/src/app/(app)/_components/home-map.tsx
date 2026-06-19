"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { MeterView } from "@/lib/dashboard/load";
import { toMapPins } from "@/lib/dashboard/map";
import { MeterMap } from "./meter-map";

// The Home hero map: every located meter on the satellite basemap, latest bill floating above
// the reconciled ones. Home has no drawer, so clicking a pin navigates to the Energy surface
// with that meter pre-opened (?meter=). A thin client wrapper over the shared <MeterMap>.
export function HomeMap({
  meters,
  energyHref,
  heightClass = "h-[420px]",
}: {
  meters: MeterView[];
  energyHref: string;
  heightClass?: string;
}) {
  const router = useRouter();
  const { pins } = useMemo(() => toMapPins(meters), [meters]);
  return (
    <MeterMap
      pins={pins}
      onOpen={(id) => router.push(`${energyHref}?meter=${id}`)}
      showBill
      heightClass={heightClass}
    />
  );
}
