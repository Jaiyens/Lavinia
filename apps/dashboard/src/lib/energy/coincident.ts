// Lever (b): coincident-peak staggering, the big recurring money. When two or
// more pumps run together in the 4-9pm window their loads stack, and the cycle's
// demand charge is set by that combined spike. Staggering them so they run one
// at a time drops the peak toward the largest single pump. This finds each
// overlap cluster, prices the avoidable kW at the bill's own $/kW, and proposes
// the hold.

import { en } from "@/copy/en";
import type { DraftRecommendation } from "@/lib/recommendations";
import { clipToPeakWindow } from "./peak";
import { pumpTimingDraft, roundUsd } from "./recommend";
import type { PumpRun } from "./types";

export type CoincidentInput = {
  farmId: string;
  runs: readonly PumpRun[];
  timezone: string;
  /** $/kW from the latest bill (effectiveDemandRate). Never hardcoded. */
  rateUsdPerKw: number;
  /** Local "today"; becomes the recs' createdAt. */
  asOf: string;
  /** Skip clusters whose avoidable dollars fall at or below this. Default 0. */
  minImpactUsd?: number;
};

type Clip = { run: PumpRun; startMs: number; endMs: number };

/** Group clips into clusters of transitively-overlapping runs (interval merge). */
function clusters(clips: readonly Clip[]): Clip[][] {
  const sorted = [...clips].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
  const out: Clip[][] = [];
  let current: Clip[] = [];
  let currentEnd = Number.NEGATIVE_INFINITY;
  for (const clip of sorted) {
    if (current.length === 0 || clip.startMs < currentEnd) {
      current.push(clip);
      currentEnd = Math.max(currentEnd, clip.endMs);
    } else {
      out.push(current);
      current = [clip];
      currentEnd = clip.endMs;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Max combined kW across a cluster (sweep line over clip boundaries). */
function coincidentPeak(cluster: readonly Clip[]): {
  kw: number;
  startMs: number;
  endMs: number;
} {
  const times = new Set<number>();
  for (const clip of cluster) {
    times.add(clip.startMs);
    times.add(clip.endMs);
  }
  const sorted = [...times].sort((a, b) => a - b);
  let best = { kw: 0, startMs: sorted[0] ?? 0, endMs: sorted[0] ?? 0 };
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === undefined || b === undefined || a >= b) continue;
    let kw = 0;
    for (const clip of cluster) {
      if (clip.startMs <= a && clip.endMs >= b) kw += clip.run.kw;
    }
    if (kw > best.kw) best = { kw, startMs: a, endMs: b };
  }
  return best;
}

/**
 * For each cluster of pumps overlapping in the 4-9pm window, a stagger
 * recommendation: keep the single largest pump running, hold the deferrable
 * others until it finishes, and the demand drops from the stacked peak to what
 * remains. The dollar delta is the shaved kW priced at the bill's $/kW. Clusters
 * with no movable (deferrable) run, or no real saving, are skipped.
 */
export function coincidentPeakRecommendations(
  input: CoincidentInput,
): DraftRecommendation[] {
  const minImpact = input.minImpactUsd ?? 0;
  const clips: Clip[] = [];
  for (const run of input.runs) {
    const clip = clipToPeakWindow(run, input.timezone);
    if (!clip) continue;
    clips.push({
      run,
      startMs: new Date(clip.start).getTime(),
      endMs: new Date(clip.end).getTime(),
    });
  }

  const recs: DraftRecommendation[] = [];
  for (const cluster of clusters(clips)) {
    if (cluster.length < 2) continue;

    const peak = coincidentPeak(cluster);
    const maxSingleKw = Math.max(...cluster.map((c) => c.run.kw));

    // Fixed (non-deferrable) runs keep overlapping; we can't go below their own
    // coincident peak. The achievable peak is the larger of that and a single pump.
    const fixed = cluster.filter((c) => c.run.deferrable === false);
    const fixedPeak = fixed.length > 0 ? coincidentPeak(fixed).kw : 0;
    const achievableKw = Math.max(maxSingleKw, fixedPeak);

    const deltaKw = peak.kw - achievableKw;
    if (deltaKw <= 0) continue;

    // Keep the largest pump (the anchor); hold the deferrable rest.
    const anchor = cluster.reduce((a, c) => (c.run.kw > a.run.kw ? c : a));
    const holds = cluster.filter(
      (c) => c.run.pumpId !== anchor.run.pumpId && c.run.deferrable !== false,
    );
    if (holds.length === 0) continue;

    const impactUsd = roundUsd(deltaKw * input.rateUsdPerKw);
    if (impactUsd <= minImpact) continue;

    const allNames = cluster.map((c) => c.run.pumpName);
    const holdNames = holds.map((c) => c.run.pumpName);

    recs.push(
      pumpTimingDraft({
        farmId: input.farmId,
        severity: "act",
        createdAt: input.asOf,
        situation: en.pumpTiming.coincident.situation(
          en.pumpTiming.names(allNames),
        ),
        impactUsd,
        impactNote: en.pumpTiming.coincident.impact(impactUsd),
        action: {
          kind: "stagger_pumps",
          label: en.pumpTiming.coincident.action(
            en.pumpTiming.names(holdNames),
            anchor.run.pumpName,
          ),
          params: {
            pumpIds: cluster.map((c) => c.run.pumpId),
            holdPumpIds: holds.map((c) => c.run.pumpId),
            anchorPumpId: anchor.run.pumpId,
            coincidentKw: roundUsd(peak.kw),
            staggeredKw: roundUsd(achievableKw),
            shavedKw: roundUsd(deltaKw),
            ratePerKw: input.rateUsdPerKw,
            overlapStart: new Date(peak.startMs).toISOString(),
            overlapEnd: new Date(peak.endMs).toISOString(),
          },
        },
      }),
    );
  }

  return recs;
}
