"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { cn } from "@/lib/cn";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// The shared shadcn/recharts bar chart, driving the Energy tab "Chart" lens. Each row is one
// billing cycle; the series are the TOU buckets (super-off-peak..peak..other) stacked into one
// column, with an optional prior-year column sitting beside it in compare mode. Colors come from
// the caller (the TOU bucket tokens), money is formatted by the caller. Unit-agnostic and stateless:
// the lens owns filtering, the YoY toggle, and empty states.

export type BarSeries = {
  /** dataKey on each row. */
  key: string;
  label: string;
  /** A CSS color (token or hex), surfaced to recharts as --color-<key> via the chart config. */
  color: string;
  /** Bars sharing a stackId stack; give the prior-year series its own id so it sits alongside. */
  stackId: string;
};

export function SpendBarChart({
  data,
  series,
  ariaLabel,
  valueFormatter = (v) => v.toLocaleString(),
  heightClass = "h-[320px]",
  className,
}: {
  data: Array<Record<string, string | number>>;
  series: BarSeries[];
  ariaLabel?: string;
  valueFormatter?: (value: number) => string;
  heightClass?: string;
  className?: string;
}) {
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      aria-label={ariaLabel}
      className={cn("aspect-auto w-full", heightClass, className)}
    >
      <BarChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: item.color }}
                  />
                  <div className="flex flex-1 items-center justify-between leading-none">
                    <span className="text-muted-foreground">
                      {config[name as keyof typeof config]?.label ?? name}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {valueFormatter(Number(value))}
                    </span>
                  </div>
                </>
              )}
            />
          }
        />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} stackId={s.stackId} fill={`var(--color-${s.key})`} />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
