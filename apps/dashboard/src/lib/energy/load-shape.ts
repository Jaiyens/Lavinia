// Synthesize a believable 15-minute interval day curve that RECONCILES to a meter's
// billed figures. The bill is truth: we never have real interval data on these accounts
// (Share My Data carries it, but the demo account does not), so the curve is a
// REPRESENTATIVE shape whose only hard constraint is that it reproduces the billed
// demand exactly - its maximum kW equals the billed peak kW, at a believable hour, with
// a realistic irrigation duty cycle around it. It is deterministic (seeded by a string)
// so the same meter always draws the same curve, and it feeds the Energy demand visuals
// (Feature A) plus the spike analysis. Powers shapes, not dollars: dollars come from
// rates.ts priced against the BILLED figures, never integrated off this curve.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in load-shape.test.ts.

/** One 15-minute interval. `minute` is the minute-of-day at the interval start:
 *  0, 15, 30, ... 1425 (96 points per day). `kw` is the average demand over it. */
export type IntervalPoint = { minute: number; kw: number };

/** 96 fifteen-minute intervals tile a 24h day. */
export const POINTS_PER_DAY = 96;
const MINUTES_PER_POINT = 15;

/** Default peak hour: mid-afternoon, when an irrigation pump set running through the
 *  day stacks against the hottest load. 15:00 = minute 900. */
const DEFAULT_PEAK_MINUTE = 15 * 60;

/** Default load factor (average kW / peak kW). A flat-out almond pump runs a large
 *  fraction of the day; 0.35 is a believable irrigation duty cycle (one long run plus a
 *  shorter block) without implying a 24h baseload. */
const DEFAULT_LOAD_FACTOR = 0.35;

/** A small, stable hash of a string -> uint32, for seeding the deterministic noise. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0; // FNV-1a basis
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32: a tiny deterministic PRNG. Same seed -> same stream, no global state. */
function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Snap a minute-of-day request onto the 15-minute grid index in [0, 95]. */
function snapToGrid(minute: number): number {
  return Math.max(0, Math.min(POINTS_PER_DAY - 1, Math.round(minute / MINUTES_PER_POINT)));
}

/**
 * A bell-shaped run block centered on `centerIndex`, half-width `halfWidthPoints`,
 * returning a 0..1 envelope per interval index. Smooth enough to read as a pump ramping
 * up and down, sharp enough that the peak interval is a clear maximum.
 */
function runEnvelope(index: number, centerIndex: number, halfWidthPoints: number): number {
  const d = (index - centerIndex) / halfWidthPoints;
  return Math.exp(-(d * d));
}

/**
 * Synthesize one day's 15-minute curve for a single load whose billed peak is `peakKw`.
 *
 * Hard guarantee: the MAXIMUM kw across the 96 points === peakKw exactly (demand
 * reconciliation - the curve can never contradict the bill), and it occurs at
 * `peakIndex` (the interval covering `peakAtMinute`, default ~15:00). Around the peak we
 * draw a believable irrigation duty cycle: a low baseline, a main afternoon run block
 * reaching peakKw, and a secondary morning block, with deterministic seeded jitter.
 * `loadFactor` (avg/peak) tunes how much of the day is "on": it scales the baseline and
 * the run-block widths so the day's average kW tracks loadFactor * peakKw, without ever
 * pushing a non-peak interval above peakKw.
 */
export function synthesizeDay(opts: {
  peakKw: number;
  peakAtMinute?: number;
  loadFactor?: number;
  seed: string;
}): { points: IntervalPoint[]; peakIndex: number } {
  const peakKw = Math.max(0, opts.peakKw);
  const loadFactor = Math.max(0.05, Math.min(0.95, opts.loadFactor ?? DEFAULT_LOAD_FACTOR));
  const peakIndex = snapToGrid(opts.peakAtMinute ?? DEFAULT_PEAK_MINUTE);
  const rand = mulberry32(hashSeed(opts.seed));

  // Baseline draw (e.g. control loads, a trickle) as a fraction of peak; grows with load
  // factor. The main run block carries the rest of the duty cycle.
  const baselineFrac = 0.08 + 0.22 * loadFactor;
  // Run-block half-widths in intervals scale with load factor (more of the day "on").
  const mainHalfWidth = 8 + 28 * loadFactor;
  const morningHalfWidth = 5 + 14 * loadFactor;
  // A secondary morning block centered ~9:00, smaller so it never rivals the peak.
  const morningIndex = snapToGrid(9 * 60);
  const morningPeakFrac = 0.55;

  // The peak interval's raw value is the reference maximum: baseline + a unit main
  // envelope, with no jitter. Every other interval is CLAMPED strictly below it so the
  // global maximum is unambiguously the peak index (jitter on a near-peak neighbour can
  // otherwise nudge it above the peak; clamping keeps reconciliation exact).
  const peakRaw = baselineFrac + 1;
  const raw: number[] = [];
  for (let i = 0; i < POINTS_PER_DAY; i += 1) {
    if (i === peakIndex) {
      raw.push(peakRaw);
      continue;
    }
    const main = runEnvelope(i, peakIndex, mainHalfWidth);
    const morning = morningPeakFrac * runEnvelope(i, morningIndex, morningHalfWidth);
    // Seeded jitter, small, so the shape reads as a real duty cycle and not a clean bell.
    const jitter = (rand() - 0.5) * 0.06;
    const shape = baselineFrac + Math.max(main, morning) + jitter;
    // Clamp below the peak so no non-peak interval can ever rival it.
    raw.push(Math.max(0, Math.min(shape, peakRaw - 1e-6)));
  }
  const points: IntervalPoint[] = raw.map((value, i) => ({
    minute: i * MINUTES_PER_POINT,
    // Round to the cent of a kW (3 dp) for stable, comparable values; the peak interval
    // is set EXACTLY to peakKw below so reconciliation is bit-exact, not rounded.
    kw: Math.round((value / peakRaw) * peakKw * 1000) / 1000,
  }));
  // Reconcile the peak to the billed kW exactly (the bill is truth).
  points[peakIndex] = { minute: peakIndex * MINUTES_PER_POINT, kw: peakKw };

  return { points, peakIndex };
}

/**
 * The "three pumps overlapped" case: several pumps whose run blocks all overlap at
 * `peakAtMinute`, so the COMBINED maximum === peakKw exactly. Each pump contributes
 * `share * peakKw` at the peak interval (shares should sum to ~1). Returns the combined
 * curve, each pump's own curve, and the shared peak interval index.
 *
 * This models the coincident-peak problem: independently each pump is modest, but run
 * together at the same hour they stack into one expensive demand peak.
 */
export function synthesizeStackedDay(opts: {
  peakKw: number;
  peakAtMinute?: number;
  pumps: { name: string; share: number }[];
  seed: string;
}): {
  combined: IntervalPoint[];
  byPump: { name: string; points: IntervalPoint[] }[];
  peakIndex: number;
} {
  const peakKw = Math.max(0, opts.peakKw);
  const peakIndex = snapToGrid(opts.peakAtMinute ?? DEFAULT_PEAK_MINUTE);
  const peakAtMinute = peakIndex * MINUTES_PER_POINT;

  // Normalize shares to sum to 1 so the contributions at the peak total peakKw even when
  // the caller's shares are slightly off (they "should sum to ~1").
  const shareSum = opts.pumps.reduce((s, p) => s + Math.max(0, p.share), 0);
  const norm = shareSum > 0 ? shareSum : 1;

  const byPump = opts.pumps.map((pump, idx) => {
    const share = Math.max(0, pump.share) / norm;
    // Each pump is its own single-load day peaking at the shared minute, scaled to its
    // share of the combined peak. A per-pump seed keeps each curve distinct yet
    // deterministic.
    const day = synthesizeDay({
      peakKw: share * peakKw,
      peakAtMinute,
      seed: `${opts.seed}:pump${idx}:${pump.name}`,
    });
    return { name: pump.name, points: day.points };
  });

  // Combine by summing each interval. By construction every pump peaks at peakIndex with
  // value share*peakKw, so the combined value there is exactly peakKw; no other interval
  // can reach it (each pump is below its own share-peak away from peakIndex).
  const combined: IntervalPoint[] = [];
  for (let i = 0; i < POINTS_PER_DAY; i += 1) {
    let sum = 0;
    for (const pump of byPump) sum += pump.points[i]?.kw ?? 0;
    // Clamp below the combined peak: the per-pump curves each max at peakIndex, but
    // rounding across the sum could otherwise let a near-peak interval edge past peakKw.
    combined.push({
      minute: i * MINUTES_PER_POINT,
      kw: i === peakIndex ? peakKw : Math.min(Math.round(sum * 1000) / 1000, peakKw),
    });
  }
  // Reconcile the combined peak to peakKw exactly (guards against rounding drift in the
  // per-pump sums).
  combined[peakIndex] = { minute: peakAtMinute, kw: peakKw };

  return { combined, byPump, peakIndex };
}

/**
 * The post-fix peak: if the pumps were STAGGERED so their run blocks never overlap, the
 * new combined max is just the single largest pump's contribution (the others have moved
 * out of the peak interval). ~= max single-pump share * peakKw. This is the number the
 * stagger recommendation quotes as the new demand peak.
 */
export function staggeredPeakKw(
  pumps: { name: string; share: number }[],
  peakKw: number,
): number {
  if (pumps.length === 0) return 0;
  const shareSum = pumps.reduce((s, p) => s + Math.max(0, p.share), 0);
  const norm = shareSum > 0 ? shareSum : 1;
  const maxShare = pumps.reduce((m, p) => Math.max(m, Math.max(0, p.share) / norm), 0);
  return Math.round(maxShare * peakKw * 1000) / 1000;
}

/** Short month label (e.g. "Jan") from an ISO instant or date-only string, in UTC. */
function shortMonth(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso);
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

/**
 * One point per period that carries a peak, for a peak-kW trend chart: the label is the
 * period's short close month, the value its billed peak kW. Periods with a null peak are
 * dropped (no peak, no point). Order is preserved from the input (callers pass periods
 * sorted by close ascending).
 */
export function monthlyPeakTrend(
  periods: { close: string; peakKw: number | null }[],
): { label: string; peakKw: number }[] {
  const out: { label: string; peakKw: number }[] = [];
  for (const period of periods) {
    if (period.peakKw === null) continue;
    out.push({ label: shortMonth(period.close), peakKw: period.peakKw });
  }
  return out;
}
