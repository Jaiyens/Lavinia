// A smooth inline-SVG area chart with a soft gradient fill, a green stroke, and a marker dot on
// the final point (the "today" reading, echoing the reference's net-worth chart). Server
// component, no dependency. Used by the Home spend hero. One series, one time frame at a time.

export type AreaPoint = {
  /** Bar/point value (>= 0), e.g. a month's spend in integer cents. */
  value: number;
  /** Short axis label under the point (e.g. "Mar"). */
  label?: string;
};

const W = 600; // viewBox width; the SVG scales to its container via preserveAspectRatio="none" on fill
const PAD_TOP = 12;
const PAD_BOTTOM = 4;

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
  height = 240,
  ariaLabel,
}: {
  points: readonly AreaPoint[];
  height?: number;
  ariaLabel: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  const stepX = points.length > 1 ? W / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: points.length > 1 ? i * stepX : W / 2,
    y: PAD_TOP + innerH - ((p.value - min) / span) * innerH,
  }));

  const line = smoothPath(coords);
  const area = `${line} L ${coords[coords.length - 1]!.x} ${height} L ${coords[0]!.x} ${height} Z`;
  const last = coords[coords.length - 1]!;
  const someLabels = points.some((p) => p.label);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
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
        {/* Today marker on the final reading. */}
        <circle cx={last.x} cy={last.y} r={4.5} fill="var(--green-deep)" />
        <circle cx={last.x} cy={last.y} r={8} fill="var(--green-deep)" fillOpacity={0.18} />
      </svg>
      {someLabels && (
        <div className="mt-2 flex justify-between">
          {points.map((p, i) => (
            <span key={i} className="type-caption text-on-surface-variant">
              {p.label ?? ""}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
