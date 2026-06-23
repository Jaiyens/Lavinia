// A smooth inline-SVG area chart with a soft gradient fill and a green stroke. It FILLS its
// container (width + height 100%) and stretches to fit (preserveAspectRatio="none"), so the
// caller sizes it by sizing the wrapper - the chart never leaves a gap or overflows. The plot is
// inset on all sides (see CHART_GEO) so the first/last points and any overlaid marker are never
// clipped at the edges. The coordinate space is a flat 0..100 box (a percent grid), and the
// geometry helpers are exported so an overlay (the spend hero's cursor dot) lands exactly on the
// curve. One series, one time frame at a time.

export type AreaPoint = {
  /** Point value (>= 0), e.g. a month's spend in integer cents. */
  value: number;
  /** Short axis label (e.g. "Mar"), surfaced by the caller's hover bubble. */
  label?: string;
};

// Plot insets as a PERCENT of the box. Shared with any overlay so the geometry stays in sync; the
// horizontal inset keeps the end points (and the marker dot) off the card edge.
export const CHART_GEO = { padXPct: 6, padTopPct: 18, padBottomPct: 8 } as const;

/** X position (0..100, percent of width) of point `i` of `n`. */
export function chartXPct(i: number, n: number): number {
  if (n <= 1) return 50;
  const inner = 100 - 2 * CHART_GEO.padXPct;
  return CHART_GEO.padXPct + (i / (n - 1)) * inner;
}

/** Y position (0..100, percent of height; 0 = top) of `value` within [min, min+span]. */
export function chartYPct(value: number, min: number, span: number): number {
  const norm = span > 0 ? (value - min) / span : 0.5;
  const inner = 100 - CHART_GEO.padTopPct - CHART_GEO.padBottomPct;
  return CHART_GEO.padTopPct + inner * (1 - norm);
}

/** Build a smooth path (Catmull-Rom -> cubic Bezier) through the points for an organic curve. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i === 0 ? 0 : i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({
  points,
  ariaLabel,
}: {
  points: readonly AreaPoint[];
  ariaLabel: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const n = points.length;

  const coords = points.map((p, i) => ({ x: chartXPct(i, n), y: chartYPct(p.value, min, span) }));
  const line = smoothPath(coords);
  // Close the area down to the baseline (bottom of the box) under the first and last points.
  const area = `${line} L ${coords[coords.length - 1]!.x} 100 L ${coords[0]!.x} 100 Z`;

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className="block h-full w-full"
    >
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areaFill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--green-deep)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
