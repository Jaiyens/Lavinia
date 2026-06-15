// A tiny inline-SVG trend line. Server component, no dependency. Used on drill summaries
// where a full chart would crowd the row. Pure presentation: it does no math beyond
// normalizing the points it is handed into the viewbox.

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
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const pad = 3;
  const h = height - pad * 2;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = pad + h - ((p - min) / span) * h;
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      fill="none"
    >
      <path d={d} className={strokeClassName} stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} className={strokeClassName} fill="currentColor" />
    </svg>
  );
}
