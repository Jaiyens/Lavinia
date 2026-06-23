"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import { formatUsdWhole } from "@/lib/format/money";
import { AreaChart, chartXPct, chartYPct } from "@/components/charts/area-chart";

// The Home spend hero (mirrors the reference's net-worth chart): a big latest-spend figure, the
// vs-last-cycle delta, time-range pills, and a soft gradient area chart of monthly PG&E spend
// (reconciled meters only). No fabricated forecast line - Terra is a planner, not a predictor.

const t = en.home.spendHero;

type RangeKey = "m3" | "m6" | "y1" | "all";
const RANGE_MONTHS: Record<RangeKey, number | null> = { m3: 3, m6: 6, y1: 12, all: null };
const RANGE_ORDER: RangeKey[] = ["m3", "m6", "y1", "all"];

const shortMonth = (monthKey: string): string =>
  new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${monthKey}-01T12:00:00`));

export function SpendHero({
  series,
  latestCents,
  foundToCutCents,
  coverageLoaded,
}: {
  series: { month: string; cents: number }[];
  latestCents: number;
  /** Total savings found, carved out of spend (the honest, non-alarming framing). */
  foundToCutCents: number;
  coverageLoaded: number;
}) {
  const [range, setRange] = useState<RangeKey>("all");

  const hasData = coverageLoaded > 0 && series.length >= 2;
  const months = RANGE_MONTHS[range];
  const sliced = months === null ? series : series.slice(-months);
  const points = sliced.map((p) => ({ value: p.cents, label: shortMonth(p.month) }));
  // The resting headline is the LATEST-CYCLE spend (`latestCents` = each reconciled meter's most recent
  // bill, summed) - the "current PG&E spend" figure the farm knows, NOT a cumulative all-time sum. The
  // range pills + chart still show the monthly trend; hovering a month shows that one month (below).

  // Cursor crosshair: as you drag along the chart the nearest month is "active", and the big
  // figure + the bubble + a dot on the curve all track it. Resting (no hover) shows the latest cycle.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const activeIdx = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < points.length ? hoverIdx : null;
  const activePoint = activeIdx !== null ? points[activeIdx] : undefined;
  const displayCents = activePoint ? activePoint.value : latestCents;
  // At rest the bubble names the latest month; on hover it names the hovered month.
  const displayLabel = activePoint?.label ?? (points.at(-1)?.label ?? t.ranges[range]);
  // The cursor dot rests on the latest point until you hover a month. The vertical range mirrors
  // AreaChart (min clamps to 0, the area baseline), and chartXPct/chartYPct give percent positions
  // that line up with the curve at any size - so the overlay tracks the chart as it scales with the
  // card, with no fixed pixel height to drift out of sync.
  const markerIdx = activeIdx ?? points.length - 1;
  const markerPoint = points[markerIdx];
  const vMax = Math.max(...points.map((p) => p.value), 1);
  const vMin = Math.min(...points.map((p) => p.value), 0);
  const vSpan = vMax - vMin || 1;

  return (
    <section className={cardClass({ radius: "2xl", className: "flex h-full min-h-0 flex-col overflow-hidden p-6" })}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-label-caps text-on-surface-variant">{t.title}</h2>
          {hasData ? (
            <p className="type-money-hero mt-1 tnum text-on-surface">{formatUsdWhole(displayCents)}</p>
          ) : (
            <p className="type-headline mt-2 text-on-surface-variant">{t.empty}</p>
          )}
          {/* Spend with savings carved out - never a big alarming increase number. */}
          {hasData && (
            <p className="type-body-sm text-on-surface-variant">
              {t.spent}
              {foundToCutCents > 0 && (
                <>
                  {" · "}
                  <span className="tnum font-medium text-money-positive">
                    {t.foundToCut(formatUsdWhole(foundToCutCents))}
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        {hasData && (
          <div
            role="group"
            aria-label={t.title}
            className="flex overflow-hidden rounded-[var(--radius-control)] border border-outline-variant"
          >
            {RANGE_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                aria-pressed={range === key}
                className={cn(
                  "min-h-[36px] px-3 type-body-sm font-semibold transition-colors",
                  range === key
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-container-low",
                )}
              >
                {t.ranges[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasData && (
        <div
          className="relative mt-4 min-h-0 flex-1 cursor-crosshair"
          onMouseMove={(e) => {
            if (points.length < 2) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1));
            setHoverIdx(Math.max(0, Math.min(points.length - 1, i)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* The value bubble follows the cursor (or rests over the latest reading), kept clear of
              the edges so it never spills past the card. */}
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 shadow-[var(--shadow-elevated)]"
            style={{ left: `${Math.min(85, Math.max(15, chartXPct(markerIdx, points.length)))}%` }}
          >
            <span className="type-caption text-on-surface-variant">{displayLabel} </span>
            <span className="type-caption tnum font-semibold text-on-surface">
              {formatUsdWhole(displayCents)}
            </span>
          </div>
          {/* Crosshair line at the hovered month. */}
          {activeIdx !== null && points.length > 1 && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 top-7 z-10 w-px bg-primary/40"
              style={{ left: `${chartXPct(activeIdx, points.length)}%` }}
            />
          )}
          {/* The marker dot rides the curve - on the latest point at rest, on the hovered month
              while dragging. Positioned in percent so it stays on the curve as the chart scales. */}
          {markerPoint && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20"
              style={{
                left: `${chartXPct(markerIdx, points.length)}%`,
                top: `${chartYPct(markerPoint.value, vMin, vSpan)}%`,
              }}
            />
          )}
          <AreaChart points={points} ariaLabel={t.title} />
        </div>
      )}
    </section>
  );
}
