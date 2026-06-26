"use client";

// The intra-day load curve (Feature A): one day of 15-minute demand readings as a filled area,
// with the peak 15-minute interval highlighted in the reserved alert tone and the rate peak window
// (5 to 8pm) shaded so the spike's position reads at a glance. Optionally overlays the per-pump
// curves (the overlap case) so the stacking that built the peak is visible. Built on the
// shadcn/recharts wrapper, every fill a CSS-variable token (matching chart-lens).

import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { IntervalPoint } from "@/lib/energy/load-shape";

const HEIGHT = 200;

// PG&E's evening price peak window, in minute-of-day (5pm to 8pm). Shaded so an evening peak
// visibly sits inside it.
const PEAK_WINDOW_START_MIN = 17 * 60;
const PEAK_WINDOW_END_MIN = 20 * 60;

const MINUTES_PER_DAY = 24 * 60;
const INTERVAL_MIN = 15;

// Per-pump overlay stroke tokens (the overlap case). Three distinct, palette-tinted lines so the
// stacking reads; the combined area stays the dominant shape behind them.
const PUMP_STROKES = ["var(--primary)", "var(--green-deep)", "var(--outline)"] as const;

/** Minute-of-day to a short "1pm" style label. */
function hourLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

const HOUR_TICKS = [0, 6 * 60, 12 * 60, 17 * 60, 20 * 60]; // midnight, 6am, noon, 5pm, 8pm

const config = {
  combined: { label: "Demand", color: "var(--green-deep)" },
} satisfies ChartConfig;

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
  const maxKw = Math.max(...combined.map((p) => p.kw), 1);

  // One row per minute on the grid; per-pump kW joined by minute so a sparse pump series still
  // lines up with the combined curve.
  const data = combined.map((p) => {
    const row: Record<string, number | null> = { minute: p.minute, combined: p.kw };
    byPump?.forEach((pump, i) => {
      const kw = pump.points.find((pt) => pt.minute === p.minute)?.kw;
      row[`pump${i}`] = kw ?? null;
    });
    return row;
  });

  const peak = combined[peakIndex];

  return (
    <figure className="m-0">
      <ChartContainer
        config={config}
        aria-label={ariaLabel}
        className="aspect-auto w-full"
        style={{ height: HEIGHT }}
      >
        <ComposedChart data={data} margin={{ top: 12, right: 10, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.26} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            type="number"
            dataKey="minute"
            domain={[0, MINUTES_PER_DAY]}
            ticks={HOUR_TICKS}
            tickFormatter={hourLabel}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            tick={{ fontSize: 10 }}
          />
          <YAxis type="number" domain={[0, maxKw]} hide />

          {/* Rate peak window shading (5 to 8pm). */}
          <ReferenceArea
            x1={PEAK_WINDOW_START_MIN}
            x2={PEAK_WINDOW_END_MIN}
            fill="var(--alert)"
            fillOpacity={0.06}
          />

          {/* The combined day curve. */}
          <Area
            dataKey="combined"
            type="monotone"
            fill="url(#loadFill)"
            stroke="var(--green-deep)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />

          {/* Per-pump overlays (overlap case): thin dashed lines so the stacking reads. */}
          {byPump?.map((pump, i) => (
            <Line
              key={pump.name}
              dataKey={`pump${i}`}
              type="monotone"
              stroke={PUMP_STROKES[i % PUMP_STROKES.length]}
              strokeWidth={1}
              strokeOpacity={0.7}
              strokeDasharray="3 2"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}

          {/* The peak 15-minute interval, called out in the reserved alert tone. */}
          {peak ? (
            <>
              <ReferenceArea
                x1={peak.minute - INTERVAL_MIN / 2}
                x2={peak.minute + INTERVAL_MIN / 2}
                fill="var(--alert)"
                fillOpacity={0.14}
              />
              <ReferenceLine
                segment={[
                  { x: peak.minute, y: 0 },
                  { x: peak.minute, y: peak.kw },
                ]}
                stroke="var(--alert)"
                strokeWidth={1.5}
              />
              <ReferenceDot
                x={peak.minute}
                y={peak.kw}
                r={4}
                fill="var(--alert)"
                stroke="none"
                label={
                  peakLabel
                    ? {
                        value: peakLabel,
                        position: "top",
                        fontSize: 11,
                        fontWeight: 600,
                        fill: "var(--on-surface)",
                      }
                    : undefined
                }
              />
            </>
          ) : null}
        </ComposedChart>
      </ChartContainer>
    </figure>
  );
}
