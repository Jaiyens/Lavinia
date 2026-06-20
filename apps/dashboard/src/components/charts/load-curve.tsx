// The intra-day load curve (Feature A): one day of 15-minute demand readings as a filled
// area, with the peak 15-minute interval highlighted in the reserved alert tone and the rate
// peak window (5 to 8pm) shaded so the spike's position reads at a glance. Optionally overlays
// the per-pump curves (the overlap case) so the stacking that built the peak is visible. Built
// on visx scales over plain SVG, every fill a CSS-variable token (matching chart-lens). Server
// component, no client state: the shape is computed once (load-shape) and handed in.

import { scaleLinear } from "@visx/scale";
import type { IntervalPoint } from "@/lib/energy/load-shape";

const W = 600;
const HEIGHT = 200;
const MARGIN = { top: 12, right: 10, bottom: 22, left: 36 };

// PG&E's evening price peak window, in minute-of-day (5pm to 8pm). Shaded so an evening
// peak visibly sits inside it.
const PEAK_WINDOW_START_MIN = 17 * 60;
const PEAK_WINDOW_END_MIN = 20 * 60;

const MINUTES_PER_DAY = 24 * 60;

// Per-pump overlay stroke tokens (the overlap case). Three distinct, palette-tinted lines so
// the stacking reads; the combined area stays the dominant shape behind them.
const PUMP_STROKES = ["var(--primary)", "var(--green-deep)", "var(--outline)"] as const;

/** Build an SVG area path (and its top line) for a series, given x/y scales. */
function areaPath(
  points: readonly IntervalPoint[],
  x: (min: number) => number,
  y: (kw: number) => number,
  baselineY: number,
): { line: string; area: string } {
  if (points.length === 0) return { line: "", area: "" };
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)} ${y(p.kw).toFixed(1)}`)
    .join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `${line} L${x(last.minute).toFixed(1)} ${baselineY.toFixed(1)} L${x(first.minute).toFixed(1)} ${baselineY.toFixed(1)} Z`;
  return { line, area };
}

/** A bare top line (no fill) for a per-pump overlay. */
function linePath(
  points: readonly IntervalPoint[],
  x: (min: number) => number,
  y: (kw: number) => number,
): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)} ${y(p.kw).toFixed(1)}`)
    .join(" ");
}

/** Minute-of-day to a short "1pm" style label. */
function hourLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

const HOUR_TICKS = [0, 6, 12, 17, 20]; // midnight, 6am, noon, 5pm, 8pm

export function LoadCurve({
  combined,
  peakIndex,
  byPump,
  ariaLabel,
  peakLabel,
}: {
  combined: readonly IntervalPoint[];
  peakIndex: number;
  /** Per-pump curves for the overlap case; omitted for the single-load case. */
  byPump?: readonly { name: string; points: readonly IntervalPoint[] }[];
  ariaLabel: string;
  /** Short label drawn at the peak (e.g. "5pm"); optional. */
  peakLabel?: string;
}) {
  if (combined.length === 0) return null;
  const innerW = W - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxKw = Math.max(...combined.map((p) => p.kw), 1);

  const x = scaleLinear<number>({ domain: [0, MINUTES_PER_DAY], range: [MARGIN.left, MARGIN.left + innerW] });
  const y = scaleLinear<number>({ domain: [0, maxKw], range: [MARGIN.top + innerH, MARGIN.top] });
  const baselineY = MARGIN.top + innerH;

  const { line, area } = areaPath(combined, (m) => x(m) ?? 0, (kw) => y(kw) ?? 0, baselineY);
  const peak = combined[peakIndex];
  const peakX = peak ? (x(peak.minute) ?? 0) : 0;
  const peakY = peak ? (y(peak.kw) ?? 0) : 0;

  // The peak interval column width on the 15-minute grid, for the highlight bar.
  const intervalW = innerW / (MINUTES_PER_DAY / 15);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Rate peak window shading (5 to 8pm). */}
        <rect
          x={x(PEAK_WINDOW_START_MIN) ?? 0}
          y={MARGIN.top}
          width={(x(PEAK_WINDOW_END_MIN) ?? 0) - (x(PEAK_WINDOW_START_MIN) ?? 0)}
          height={innerH}
          fill="var(--alert)"
          fillOpacity={0.06}
        />

        {/* The combined day curve. */}
        <path d={area} fill="url(#loadFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--green-deep)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Per-pump overlays (overlap case): thin lines so the stacking reads. */}
        {byPump?.map((pump, i) => (
          <path
            key={pump.name}
            d={linePath(pump.points, (m) => x(m) ?? 0, (kw) => y(kw) ?? 0)}
            fill="none"
            stroke={PUMP_STROKES[i % PUMP_STROKES.length]}
            strokeWidth={1}
            strokeOpacity={0.7}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* The peak 15-minute interval, called out in the reserved alert tone. */}
        {peak && (
          <>
            <rect
              x={peakX - intervalW / 2}
              y={MARGIN.top}
              width={intervalW}
              height={innerH}
              fill="var(--alert)"
              fillOpacity={0.14}
            />
            <line
              x1={peakX}
              y1={peakY}
              x2={peakX}
              y2={baselineY}
              stroke="var(--alert)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={peakX} cy={peakY} r={4} fill="var(--alert)" />
            {peakLabel && (
              <text
                x={peakX}
                y={MARGIN.top - 2}
                textAnchor="middle"
                className="fill-on-surface"
                fontSize={11}
                fontWeight={600}
              >
                {peakLabel}
              </text>
            )}
          </>
        )}

        {/* Hour ticks. */}
        {HOUR_TICKS.map((min) => (
          <text
            key={min}
            x={x(min) ?? 0}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-on-surface-variant"
            fontSize={10}
          >
            {hourLabel(min)}
          </text>
        ))}
      </svg>
    </figure>
  );
}
