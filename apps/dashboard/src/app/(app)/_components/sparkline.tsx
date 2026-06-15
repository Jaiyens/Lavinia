import { cn } from "@/lib/cn";

// A tiny inline-SVG sparkline. Tokens only (currentColor), no chart dependency (visx arrives in
// Story 2.8). Renders nothing for fewer than two points (the caller hides the trend then, so this
// is a defensive guard, never a flat fabricated line).
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
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // flat series -> a level line (no divide-by-zero)
  const step = width / (series.length - 1);
  const points = series
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
