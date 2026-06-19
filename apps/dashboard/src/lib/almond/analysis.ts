// The single source of truth for meter economics and findings (Almond hardening, T1). Meters +
// findings in, one enriched analysis out. Everything downstream - the agent query tool, the Excel
// export, the PDF, the chat - imports THIS so a generated file can never contradict the live
// dashboard. It derives from the same FindingView rows the findings rail reads, so the dollars
// agree by construction. Every dollar field is integer cents as a `number`; this module NEVER
// emits a formatted string (formatting is money.ts's job, at the render edge).
//
// Pure: no Prisma, no fs, no clock. Same per-meter latest-reconciled-period selection as kpi.ts
// (a meter contributes spend only when its coverageState is reconciled), so the totals here match
// the KPI strip. Sorts are deterministic with a stable name/id tie-break.

import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { centsFromDollars } from "@/lib/format/money";

const RECONCILED = "reconciled";

export interface EnrichedMeter {
  id: string;
  name: string;
  /** entityName */
  entity: string | null;
  /** ranchName */
  ranch: string | null;
  /** rateSchedule */
  rate: string | null;
  /** Latest reconciled period printedTotalCents; null when the meter is not reconciled. */
  thisCycleCents: number | null;
  /** Latest reconciled period demandCents; null when the meter is not reconciled / no demand. */
  demandChargeCents: number | null;
  coverageState: string;
  flags: {
    /** True iff a finding for this meter has a non-null rateSwitchTo. */
    misRated: boolean;
    /** That finding's rateSwitchTo (the highest-impact one when several); null when not mis-rated. */
    suggestedRate: string | null;
    /** centsFromDollars(finding.impactUsd) of the highest-impact rate-switch finding; 0 when none. */
    estAnnualSavingsCents: number;
  };
}

export interface FarmAnalysis {
  meters: EnrichedMeter[];
  totals: {
    spendCents: number;
    demandChargeCents: number;
    meterCount: number;
    entityCount: number;
  };
  byEntity: Array<{
    entity: string;
    spendCents: number;
    demandChargeCents: number;
    meterCount: number;
  }>;
  /** Copy of meters, descending by thisCycleCents (null sorts last). */
  rankingsByCost: EnrichedMeter[];
  /** Mis-rated meters only, descending by flags.estAnnualSavingsCents. */
  opportunities: EnrichedMeter[];
}

/** The latest reconciled period's printed total and demand, in integer cents. A meter that is not
 *  reconciled contributes nothing (null), mirroring kpi.ts's AR-15 "a number renders only when
 *  proven" law. Among the meter's periods we take the one with the greatest `close` ISO date. */
function latestReconciled(meter: MeterView): {
  thisCycleCents: number | null;
  demandChargeCents: number | null;
} {
  if (meter.coverageState !== RECONCILED) {
    return { thisCycleCents: null, demandChargeCents: null };
  }
  let latest: MeterView["periods"][number] | null = null;
  for (const period of meter.periods) {
    if (latest === null || period.close > latest.close) latest = period;
  }
  if (latest === null) return { thisCycleCents: null, demandChargeCents: null };
  return {
    thisCycleCents: latest.printedTotalCents,
    demandChargeCents: latest.demandCents,
  };
}

/** The highest-impact rate-switch finding for a meter (rateSwitchTo non-null), or null. Ties break
 *  on finding id so selection is deterministic. impactUsd is treated as 0 when null for ranking. */
function topRateSwitch(findings: FindingView[]): FindingView | null {
  let best: FindingView | null = null;
  for (const finding of findings) {
    if (finding.rateSwitchTo === null) continue;
    if (best === null) {
      best = finding;
      continue;
    }
    const impact = finding.impactUsd ?? 0;
    const bestImpact = best.impactUsd ?? 0;
    if (impact > bestImpact || (impact === bestImpact && finding.id < best.id)) {
      best = finding;
    }
  }
  return best;
}

/** Stable descending-by-cents comparator with a name-then-id tie-break. `getCents` returning null
 *  sorts that meter last (null is "unknown spend", never the most expensive). */
function byCentsDescStable(
  getCents: (m: EnrichedMeter) => number | null,
): (a: EnrichedMeter, b: EnrichedMeter) => number {
  return (a, b) => {
    const ca = getCents(a);
    const cb = getCents(b);
    if (ca === null && cb === null) return tieBreak(a, b);
    if (ca === null) return 1;
    if (cb === null) return -1;
    if (cb !== ca) return cb - ca;
    return tieBreak(a, b);
  };
}

function tieBreak(a: EnrichedMeter, b: EnrichedMeter): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Enrich a farm's meters with their economics and rate-switch findings, then roll them up.
 * Pure and deterministic. Dollars are integer cents (`number`) throughout.
 */
export function analyzeFarm(meters: MeterView[], findings: FindingView[]): FarmAnalysis {
  const findingsByMeter = new Map<string, FindingView[]>();
  for (const finding of findings) {
    if (finding.meterId === null) continue;
    const list = findingsByMeter.get(finding.meterId);
    if (list) list.push(finding);
    else findingsByMeter.set(finding.meterId, [finding]);
  }

  const enriched: EnrichedMeter[] = meters.map((meter) => {
    const { thisCycleCents, demandChargeCents } = latestReconciled(meter);
    const top = topRateSwitch(findingsByMeter.get(meter.id) ?? []);
    const misRated = top !== null;
    return {
      id: meter.id,
      name: meter.name,
      entity: meter.entityName,
      ranch: meter.ranchName,
      rate: meter.rateSchedule,
      thisCycleCents,
      demandChargeCents,
      coverageState: meter.coverageState,
      flags: {
        misRated,
        suggestedRate: top?.rateSwitchTo ?? null,
        estAnnualSavingsCents: top !== null ? centsFromDollars(top.impactUsd ?? 0) : 0,
      },
    };
  });

  // Totals. Spend sums each meter's latest-reconciled printed total (null -> 0); demand the same.
  let spendCents = 0;
  let demandChargeCents = 0;
  const entitySet = new Set<string>();
  for (const m of enriched) {
    spendCents += m.thisCycleCents ?? 0;
    demandChargeCents += m.demandChargeCents ?? 0;
    if (m.entity !== null) entitySet.add(m.entity);
  }

  // Per-entity rollups (only meters that carry an entity). Keyed map preserves insertion order;
  // we then sort by entity name for a deterministic shape.
  const entityRollups = new Map<
    string,
    { entity: string; spendCents: number; demandChargeCents: number; meterCount: number }
  >();
  for (const m of enriched) {
    if (m.entity === null) continue;
    const row = entityRollups.get(m.entity) ?? {
      entity: m.entity,
      spendCents: 0,
      demandChargeCents: 0,
      meterCount: 0,
    };
    row.spendCents += m.thisCycleCents ?? 0;
    row.demandChargeCents += m.demandChargeCents ?? 0;
    row.meterCount += 1;
    entityRollups.set(m.entity, row);
  }
  const byEntity = [...entityRollups.values()].sort((a, b) =>
    a.entity < b.entity ? -1 : a.entity > b.entity ? 1 : 0,
  );

  const rankingsByCost = [...enriched].sort(byCentsDescStable((m) => m.thisCycleCents));

  const opportunities = enriched
    .filter((m) => m.flags.misRated)
    .sort(byCentsDescStable((m) => m.flags.estAnnualSavingsCents));

  return {
    meters: enriched,
    totals: {
      spendCents,
      demandChargeCents,
      meterCount: meters.length,
      entityCount: entitySet.size,
    },
    byEntity,
    rankingsByCost,
    opportunities,
  };
}
