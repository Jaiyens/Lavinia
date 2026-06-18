"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryState } from "nuqs";
import { scaleBand, scaleLinear } from "@visx/scale";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { formatUsd, formatUsdWhole } from "@/lib/format/money";
import type { MeterView } from "@/lib/dashboard/load";
import { filterMeters } from "@/lib/dashboard/table";
import { toChartBars, yoyPairs, type ChartBar, type TouBucket } from "@/lib/dashboard/chart";
import { SURFACE } from "@/lib/dashboard/surface";
import { isActiveFilterValue } from "./filter-bar";

// The Chart lens (Story 2.8): the default hero face. One TOU-stacked bar per reconciled
// meter-period (a bar click opens THAT meter's drawer via the nuqs `meter` key), close date
// ascending then total descending, dollars on the axis. Built on visx scales over plain SVG
// rects; every fill reads a CSS-variable token, never hex. Narrows through the same
// filterMeters predicate as the table and KPI strip. The YoY toggle is local state and
// degrades honestly (disabled with a plain caption) until a prior year of bills exists.

const t = en.shell.chart;

const BUCKET_FILL: Record<TouBucket, string> = {
  peak: "var(--alert)",
  part_peak: "var(--outline)",
  off_peak: "var(--primary)",
  super_off_peak: "var(--primary-container)",
  other: "var(--surface-container-highest)",
};

const PRIOR_FILL = "var(--surface-container-high)";

const MARGIN = { top: 8, right: 8, bottom: 28, left: 64 };
const HEIGHT = 320;

/** Stack a bar's segments bottom-up into rect geometry. */
function stackRects(bar: ChartBar, y: (cents: number) => number) {
  let cum = 0;
  return bar.segments.map((seg) => {
    const y0 = cum;
    cum += seg.cents;
    return { bucket: seg.bucket, y: y(cum), height: Math.max(0, y(y0) - y(cum)) };
  });
}

export function ChartLens({ meters }: { meters: MeterView[] }) {
  const [entity, setEntity] = useQueryState(SURFACE.entity);
  const [ranch, setRanch] = useQueryState(SURFACE.ranch);
  const [rate, setRate] = useQueryState(SURFACE.rate);
  const [yoy, setYoy] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // The column under the pointer / keyboard focus brightens while the rest dim a touch,
  // so the eye lands on the bar being read (the native <title> carries its name + dollars).
  const [hovered, setHovered] = useState<string | null>(null);

  const { bars, metersWithoutTou } = useMemo(
    () => toChartBars(filterMeters(meters, { entity, ranch, rate })),
    [meters, entity, ranch, rate],
  );
  const hasBars = bars.length > 0;

  // Re-bind when the wrapper (re)mounts: the empty-state branch renders no wrapper, so a
  // mount-only effect would leave the chart permanently unmeasured after a filter clears.
  useEffect(() => {
    if (!hasBars) return;
    const el = wrapRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasBars]);

  const pairs = useMemo(() => yoyPairs(bars), [bars]);
  const comparing = yoy && pairs.length > 0;

  // In compare mode the chart narrows to the bars that HAVE a prior-year equivalent
  // (never a fabricated baseline); otherwise every bar renders. Priors are looked up by
  // object identity, so a rebill sharing a close instant cannot cross-wire pairs.
  const shown = comparing ? pairs.map((p) => p.current) : bars;
  const priorByBar = useMemo(() => new Map(pairs.map((p) => [p.current, p.prior])), [pairs]);

  const presentBuckets = useMemo(() => {
    const set = new Set<TouBucket>();
    for (const bar of shown) for (const seg of bar.segments) set.add(seg.bucket);
    return set;
  }, [shown]);

  if (bars.length === 0) {
    const hasActiveFilter =
      isActiveFilterValue(entity) || isActiveFilterValue(ranch) || isActiveFilterValue(rate);
    const clearAll = () => {
      void setEntity(null);
      void setRanch(null);
      void setRate(null);
    };
    return (
      <div
        id="energy-lens"
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 shadow-e1"
      >
        <p className="type-body-md text-on-surface-variant">
          {meters.length === 0 ? en.shell.table.emptyFarm : t.emptyView}
        </p>
        {meters.length > 0 && hasActiveFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {en.shell.filter.clear}
          </button>
        )}
      </div>
    );
  }

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxCents = shown.reduce((acc, bar) => {
    const prior = priorByBar.get(bar);
    return Math.max(acc, bar.totalCents, comparing ? (prior?.totalCents ?? 0) : 0);
  }, 0);

  const x = scaleBand<string>({
    // One band per cycle; the month key is already unique across the shown bars.
    domain: shown.map((bar) => bar.key),
    range: [0, innerW],
    padding: 0.3,
  });
  const y = scaleLinear<number>({
    // An all-zero view (idle pumps billing $0 of TOU energy) keeps $0 on the baseline
    // instead of collapsing the scale to its midpoint.
    domain: [0, Math.max(maxCents, 1)],
    range: [innerH, 0],
    nice: true,
  });
  // Dedupe by formatted label so whole-dollar ticks never repeat at small magnitudes.
  const ticks = [...new Map(y.ticks(4).map((tk) => [formatUsdWhole(tk), tk])).values()];
  const bw = x.bandwidth();

  return (
    <section id="energy-lens" aria-label={t.caption} className="scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* Legend: only the buckets actually on screen, color always paired with its label. */}
        <ul aria-label={t.legendLabel} className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {(Object.keys(BUCKET_FILL) as TouBucket[])
            .filter((b) => presentBuckets.has(b))
            .map((b) => (
              <li key={b} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-[2px] border border-outline-variant"
                  style={{ background: BUCKET_FILL[b] }}
                />
                <span className="type-caption text-on-surface-variant">{t.buckets[b]}</span>
              </li>
            ))}
          {comparing && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-3 w-3 rounded-[2px] border border-outline-variant"
                style={{ background: PRIOR_FILL }}
              />
              <span className="type-caption text-on-surface-variant">{t.priorLabel}</span>
            </li>
          )}
        </ul>

        <label
          className={cn(
            "flex min-h-[44px] items-center gap-2 type-body-md",
            pairs.length === 0 ? "text-on-surface-variant/60" : "text-on-surface",
          )}
        >
          <input
            type="checkbox"
            checked={comparing}
            disabled={pairs.length === 0}
            onChange={(e) => setYoy(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          <span>{t.yoyLabel}</span>
          {pairs.length === 0 && (
            <span className="type-caption text-on-surface-variant/70">{t.yoyDisabled}</span>
          )}
        </label>
      </div>

      <div
        ref={wrapRef}
        className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4 shadow-e1"
      >
        {/* contentRect already excludes the wrapper padding, so the svg takes the full
            measured width. No role="img": the bars inside are interactive buttons and an
            img role would mark them presentational; the section carries the label. */}
        {width > MARGIN.left + MARGIN.right && (
          <svg width={width} height={HEIGHT}>
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* Dollar axis: hairline gridlines + tabular whole-dollar ticks. */}
              {ticks.map((tick) => (
                <g key={tick} transform={`translate(0,${y(tick)})`}>
                  <line x1={0} x2={innerW} stroke="var(--outline-variant)" strokeWidth={1} />
                  <text
                    x={-8}
                    dy="0.32em"
                    textAnchor="end"
                    className="tnum"
                    fontSize={12}
                    fill="var(--on-surface-variant)"
                  >
                    {formatUsdWhole(tick)}
                  </text>
                </g>
              ))}

              {shown.map((bar, i) => {
                const bx = x(bar.key);
                if (bx === undefined) return null;
                const prior = comparing ? priorByBar.get(bar) : undefined;
                const curW = prior !== undefined ? bw / 2 : bw;
                const label = t.barAria(bar.label, formatUsd(bar.totalCents), bar.meterCount);
                return (
                  <g
                    key={bar.key}
                    className="chart-bar-grow"
                    style={{
                      // Small staggered start so the columns rise in a wave, capped so a
                      // long history never drags the reveal out.
                      animationDelay: `${Math.min(i * 30, 400)}ms`,
                      opacity: hovered !== null && hovered !== bar.key ? 0.45 : 1,
                      transition: "opacity var(--dur-fast) var(--ease-standard)",
                    }}
                  >
                    {/* Prior-year total, muted, beside the current stack (compare mode). */}
                    {prior !== undefined && (
                      <rect
                        x={bx}
                        y={y(prior.totalCents)}
                        width={bw / 2}
                        height={innerH - y(prior.totalCents)}
                        fill={PRIOR_FILL}
                        stroke="var(--outline-variant)"
                        strokeWidth={1}
                      />
                    )}
                    {stackRects(bar, y).map((r, j) => (
                      <rect
                        key={j}
                        x={prior !== undefined ? bx + bw / 2 : bx}
                        y={r.y}
                        width={curW}
                        height={r.height}
                        fill={BUCKET_FILL[r.bucket]}
                      />
                    ))}
                    {/* A $0 TOU cycle is honest data (idle pumps): a baseline tick keeps the
                        cycle visible instead of vanishing. */}
                    {bar.totalCents === 0 && (
                      <rect
                        x={prior !== undefined ? bx + bw / 2 : bx}
                        y={innerH - 2}
                        width={curW}
                        height={2}
                        fill="var(--outline)"
                      />
                    )}
                    {/* Full-column hover target: informational, not a drawer door. The chart is
                        the trend; per-meter detail lives in the table and drawer. role=img +
                        <title> give the cycle readout to assistive tech and a hover tooltip. */}
                    <rect
                      x={bx}
                      y={0}
                      width={bw}
                      height={innerH}
                      fill="transparent"
                      role="img"
                      aria-label={label}
                      onMouseEnter={() => setHovered(bar.key)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <title>{label}</title>
                    </rect>
                  </g>
                );
              })}

              {/* X axis: the cycle month under each bar (the full "Mon Year" is in the tooltip). */}
              {shown.map((bar) => {
                const bx = x(bar.key);
                if (bx === undefined) return null;
                return (
                  <text
                    key={bar.key}
                    x={bx + bw / 2}
                    y={innerH + 18}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--on-surface-variant)"
                  >
                    {bar.label.split(" ")[0]}
                  </text>
                );
              })}

              {/* Baseline. */}
              <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--outline)" strokeWidth={1} />
            </g>
          </svg>
        )}
        {metersWithoutTou > 0 && (
          <p className="mt-2 type-caption text-on-surface-variant">
            {t.withoutTou(metersWithoutTou)}
          </p>
        )}
      </div>
    </section>
  );
}
