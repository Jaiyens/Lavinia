"use client";

import { Line, LineChart } from "recharts";

import { cn } from "@/lib/cn";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

// A tiny trend line on the shadcn/recharts wrapper. Used on drill summaries where a full chart
// would crowd the row. Stroke is currentColor, tinted by strokeClassName. Renders an empty
// placeholder of the same footprint for fewer than two points.

const config = {
  value: { label: "Trend" },
} satisfies ChartConfig;

export function Sparkline({
  points,
  width = 132,
  height = 36,
  className,
  strokeClassName = "text-green-deep",
  ariaLabel,
}: {
  points: readonly number[];
  width?: number;
  height?: number;
  className?: string;
  strokeClassName?: string;
  ariaLabel?: string;
}) {
  if (points.length < 2) {
    return <div className={className} style={{ width, height }} aria-hidden />;
  }
  const data = points.map((v, i) => ({ i, value: v }));

  return (
    <ChartContainer
      config={config}
      aria-label={ariaLabel}
      className={cn("aspect-auto", strokeClassName, className)}
      style={{ width, height }}
    >
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line
          dataKey="value"
          type="monotone"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
