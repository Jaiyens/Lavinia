"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { SURFACE } from "@/lib/dashboard/surface";
import { filterMeters } from "@/lib/dashboard/table";
import { buildSolarDataset } from "@/lib/dashboard/solar";
import type { MeterView } from "@/lib/dashboard/load";
import { FilterBar } from "../filter-bar";
import { SolarKpiStrip } from "./solar-kpi-strip";
import { SolarLensToggle } from "./solar-lens-toggle";
import { SolarLensRegion } from "./solar-lens-region";

// The filter-aware solar surface (A-7). One client owner of the five filter dimensions
// (entity / ranch / rate / account / program) so the KPI strip, the lens region, and every lens
// narrow CONSISTENTLY to the same matching meters - the architecture's "the list, the KPI counts,
// and every lens narrow consistently to only matching meters" (FR1).
//
// It reads the nuqs filter keys through the closed SURFACE registry, narrows the canonical
// MeterView[] once via the pure filterMeters(), and rebuilds the solar dataset over the narrowed
// fleet via buildSolarDataset(). The KPI strip and the lens region both consume that one narrowed
// dataset, so the four KPI counts always match what the lenses show. `nowMonth` (1-12) is injected
// from the server page edge so the rebuild stays clock-free (NFR1); no interval series is read
// (NFR4). The FilterBar writes only the filter keys; the toggle writes only `lens`; neither ever
// drops the other's key or the open `?meter=` drawer.
export function SolarSurface({
  meters,
  nowMonth,
  nowIso,
  nameplateVerified = false,
  unlinkedNemaCodes,
}: {
  meters: MeterView[];
  /** The page-edge "now" month (1-12), injected so the rebuilt next-true-up KPI stays clock-free. */
  nowMonth: number;
  /** F-1 (FR16): the page-edge "now" instant (ISO), injected so the rebuilt grandfather position
   *  stays clock-free (NFR1). Omitted leaves every array's grandfather position honest-unknown. */
  nowIso?: string;
  /**
   * DM4 (C-1, FR6): `Farm.solarLayoutVerifiedAt != null`, read at the server page edge and injected
   * so the pure builder stays IO-free. Omitted/false => the cautious nameplate render (fail-closed).
   */
  nameplateVerified?: boolean;
  /** importInventory's referenced-but-unlinked NEMA codes, surfaced as needs-review rows (C-1, FR6). */
  unlinkedNemaCodes?: string[];
}) {
  const [entity] = useQueryState(SURFACE.entity);
  const [ranch] = useQueryState(SURFACE.ranch);
  const [rate] = useQueryState(SURFACE.rate);
  const [account] = useQueryState(SURFACE.account);
  const [program] = useQueryState(SURFACE.program);

  const filtered = useMemo(
    () => filterMeters(meters, { entity, ranch, rate, account, program }),
    [meters, entity, ranch, rate, account, program],
  );
  const dataset = useMemo(
    () => buildSolarDataset(filtered, nowMonth, { nameplateVerified, unlinkedNemaCodes, asOf: nowIso }),
    [filtered, nowMonth, nameplateVerified, unlinkedNemaCodes, nowIso],
  );

  return (
    <div className="space-y-5">
      <SolarKpiStrip kpis={dataset.kpis} />
      <FilterBar meters={meters} showAccount showProgram />
      <SolarLensToggle />
      <SolarLensRegion dataset={dataset} meters={filtered} nowMonth={nowMonth} />
    </div>
  );
}
