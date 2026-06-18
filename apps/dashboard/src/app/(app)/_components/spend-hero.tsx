"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import { formatUsdWhole } from "@/lib/format/money";
import { AreaChart } from "@/components/charts/area-chart";

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

  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-label-caps text-on-surface-variant">{t.title}</h2>
          {hasData ? (
            <p className="type-money-hero mt-1 tnum text-on-surface">{formatUsdWhole(latestCents)}</p>
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
        <div className="relative mt-4">
          {/* A small bubble pinned over the latest reading (echoes the reference's chart tooltip). */}
          {points.length > 0 && (
            <div className="pointer-events-none absolute right-2 top-0 z-10 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 shadow-[var(--shadow-elevated)]">
              <span className="type-caption text-on-surface-variant">
                {points[points.length - 1]!.label}{" "}
              </span>
              <span className="type-caption tnum font-semibold text-on-surface">
                {formatUsdWhole(latestCents)}
              </span>
            </div>
          )}
          <AreaChart points={points} ariaLabel={t.title} height={240} />
        </div>
      )}
    </section>
  );
}
