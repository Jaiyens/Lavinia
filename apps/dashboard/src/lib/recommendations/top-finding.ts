// Shared finding ranking. The dashboard and the onboarding reveal both need to agree
// on which recommendation is "the biggest finding," so the ordering lives here once:
// highest severity first, then the largest dollar impact. No UI, no DB, structural
// over a minimal shape so both a persisted Recommendation row and a mapped view sort
// the same way.

import type { Severity } from "./types";

/** Severity ordering: act (money on the table) beats watch beats info. */
export const SEVERITY_RANK: Record<Severity, number> = { info: 1, watch: 2, act: 3 };

/** The least a value needs to be ranked: a severity and an optional dollar impact. */
export type Rankable = { severity: string; impactUsd: number | null };

/** Sort comparator (descending): highest severity first, then biggest dollar. */
export function compareFindings(a: Rankable, b: Rankable): number {
  const r =
    (SEVERITY_RANK[b.severity as Severity] ?? 0) - (SEVERITY_RANK[a.severity as Severity] ?? 0);
  if (r !== 0) return r;
  return (b.impactUsd ?? 0) - (a.impactUsd ?? 0);
}

/** The single top finding by severity then dollar, or null when there are none. */
export function topFinding<T extends Rankable>(recs: readonly T[]): T | null {
  return [...recs].sort(compareFindings)[0] ?? null;
}
