"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/cn";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// The shared shadcn/recharts area chart. Replaces the bespoke SVG area chart everywhere a single
// trend-over-time series is shown: the Home PG&E spend hero and the Energy meter drawer's intraday
// load curve. One green-filled gradient series; the X labels and the tooltip value are formatted by
// the caller (dollars for spend, kW for the load curve) so this stays unit-agnostic. The series
// color reads --chart-1 (the aurora green) via shadcn's chart config, so it sits in the palette.

export type AreaPoint = { label: string; value: number };

export function SpendAreaChart({
  points,
  seriesLabel = "Spend",
  ariaLabel,
  valueFormatter = (v) => v.toLocaleString(),
  heightClass = "h-[250px]",
  className,
}: {
  points: AreaPoint[];
  /** Legend/tooltip name for the single series. */
  seriesLabel?: string;
  ariaLabel?: string;
  /** Render the raw numeric value as a human string (e.g. cents -> "$1,200", kW -> "320 kW"). */
  valueFormatter?: (value: number) => string;
  /** Tailwind height class for the chart body. */
  heightClass?: string;
  className?: string;
}) {
  // Gradient ids must be unique per chart instance (two charts on one page) and valid in url(#..),
  // so strip the colons React.useId emits.
  const gradientId = `fill-${React.useId().replace(/:/g, "")}`;

  const config = {
    value: { label: seriesLabel, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      aria-label={ariaLabel}
      className={cn("aspect-auto w-full", heightClass, className)}
    >
      <AreaChart data={points} margin={{ left: 12, right: 12 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
        {/* Hidden, zero-anchored axis so the area fill never dips below the baseline. */}
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name, item) => (
                <>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: item.color }}
                  />
                  <div className="flex flex-1 items-center justify-between leading-none">
                    <span className="text-muted-foreground">{config.value.label}</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {valueFormatter(Number(value))}
                    </span>
                  </div>
                </>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          fill={`url(#${gradientId})`}
          stroke="var(--color-value)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
