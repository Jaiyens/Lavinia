"use client";

import { Bar, BarChart, Cell, XAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

// A small column chart on the shadcn/recharts wrapper. One time frame per chart (the spec's
// rule): daily peaks within a cycle, or one bar per billing cycle for spend / usage over time.
// One bar can be highlighted (e.g. the day that set a demand charge), which is the only place the
// reserved red appears in a chart.

export type Column = {
  /** Bar height value (>= 0). */
  value: number;
  /** Short axis label under the bar (e.g. "14" or "Jul"). */
  label?: string;
  /** Highlight this bar as the at-risk one (renders in the reserved red). */
  highlight?: boolean;
};

const config = {
  value: { label: "Value", color: "var(--green-deep)" },
} satisfies ChartConfig;

export function ColumnChart({
  columns,
  height = 160,
  ariaLabel,
  caption,
}: {
  columns: readonly Column[];
  height?: number;
  ariaLabel: string;
  caption?: string;
}) {
  if (columns.length === 0) return null;
  const hasLabels = columns.some((c) => c.label);
  // Match the old hand-rolled bar spacing so dense day grids stay legible.
  const gap = columns.length > 40 ? 1 : columns.length > 18 ? 2 : 4;
  const data = columns.map((c, i) => ({ ...c, i }));

  return (
    <figure className="m-0">
      <ChartContainer
        config={config}
        aria-label={ariaLabel}
        className="aspect-auto w-full"
        style={{ height }}
      >
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={gap}>
          {hasLabels ? (
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              interval={0}
              tick={{ fontSize: 10 }}
            />
          ) : null}
          <Bar dataKey="value" radius={[8, 8, 0, 0]} minPointSize={2} isAnimationActive={false}>
            {data.map((c) => (
              <Cell
                key={c.i}
                fill={c.highlight ? "var(--risk)" : "var(--green-deep)"}
                fillOpacity={c.highlight ? 1 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {caption ? (
        <figcaption className="text-muted mt-3 text-sm leading-relaxed">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
