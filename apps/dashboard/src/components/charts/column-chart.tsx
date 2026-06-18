import { cn } from "@/lib/cn";

// A small inline-SVG column chart. Server component, no dependency. One time frame per
// chart (the spec's rule): daily peaks within a cycle, or one bar per billing cycle for
// spend / usage over time. One bar can be highlighted (e.g. the day that set a demand
// charge), which is the only place the reserved red appears in a chart.

export type Column = {
  /** Bar height value (>= 0). */
  value: number;
  /** Short axis label under the bar (e.g. "14" or "Jul"). */
  label?: string;
  /** Highlight this bar as the at-risk one (renders in the reserved red). */
  highlight?: boolean;
};

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
  const max = Math.max(...columns.map((c) => c.value), 1);
  const gap = columns.length > 40 ? 1 : columns.length > 18 ? 2 : 4;

  return (
    <figure className="m-0">
      <div
        className="flex items-end gap-[var(--gap)]"
        style={{ height, ["--gap" as string]: `${gap}px` }}
        role="img"
        aria-label={ariaLabel}
      >
        {columns.map((c, i) => {
          const pct = Math.max((c.value / max) * 100, c.value > 0 ? 2 : 0);
          return (
            <div key={i} className="flex h-full flex-1 flex-col justify-end" title={c.label}>
              <div
                className={cn(
                  "w-full rounded-t-lg",
                  c.highlight ? "bg-risk" : "bg-green-deep/85",
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      {columns.some((c) => c.label) ? (
        <div className="text-faint mt-2 flex gap-[var(--gap)] font-mono text-[0.6rem]" style={{ ["--gap" as string]: `${gap}px` }}>
          {columns.map((c, i) => (
            <span key={i} className="flex-1 truncate text-center">
              {c.label ?? ""}
            </span>
          ))}
        </div>
      ) : null}
      {caption ? <figcaption className="text-muted mt-3 text-sm leading-relaxed">{caption}</figcaption> : null}
    </figure>
  );
}
