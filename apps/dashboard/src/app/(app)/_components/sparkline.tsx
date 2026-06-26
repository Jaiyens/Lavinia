"use client";

import { Line, LineChart } from "recharts";

import { cn } from "@/lib/cn";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

// A tiny trend line on the shadcn/recharts wrapper. Stroke is currentColor, so the caller tints it
// by passing a text color via className. Renders nothing for fewer than two points (the caller
// hides the trend then, so this is a defensive guard, never a flat fabricated line).

const config = {
  value: { label: "Trend" },
} satisfies ChartConfig;

export function Sparkline({
  series,
  className,
  width = 64,
  height = 20,
}: {
  series: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (series.length < 2) return null;
  const data = series.map((v, i) => ({ i, value: v }));

  return (
    <ChartContainer
      config={config}
      aria-hidden
      className={cn("aspect-auto", className)}
      style={{ width, height }}
    >
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          dataKey="value"
          type="monotone"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
