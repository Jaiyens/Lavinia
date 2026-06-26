"use client";

import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import type { MeterView } from "@/lib/dashboard/load";
import { filterMeters } from "@/lib/dashboard/table";
import {
  BUCKET_ORDER,
  toChartBars,
  yoyPairs,
  type ChartBar,
  type TouBucket,
} from "@/lib/dashboard/chart";
import { SURFACE } from "@/lib/dashboard/surface";
import { SpendBarChart, type BarSeries } from "@/components/charts/spend-bar-chart";
import { Button } from "@/components/ui/button";
import { isActiveFilterValue } from "./filter-bar";

// The Chart lens (Story 2.8): the default hero face. One TOU-stacked bar per reconciled
// billing cycle, close date ascending, dollars on the axis. Now rendered with the shared
// shadcn/recharts bar chart (SpendBarChart); this component still owns the data prep - the same
// filterMeters predicate as the table and KPI strip, the YoY toggle, and the honest empty state.
// The YoY compare narrows to cycles that HAVE a prior-year equivalent (never a fabricated baseline).

const t = en.shell.chart;

// TOU bucket fills (color always paired with its label in the legend + tooltip). The prior-year
// series gets a muted neutral so the compare reads as "this cycle vs the same cycle last year".
const BUCKET_FILL: Record<TouBucket, string> = {
  peak: "var(--alert)",
  part_peak: "var(--outline)",
  off_peak: "var(--primary)",
  super_off_peak: "var(--primary-container)",
  other: "var(--surface-container-highest)",
};
const PRIOR_FILL = "var(--surface-container-high)";

export function ChartLens({ meters }: { meters: MeterView[] }) {
  const [entity, setEntity] = useQueryState(SURFACE.entity);
  const [ranch, setRanch] = useQueryState(SURFACE.ranch);
  const [rate, setRate] = useQueryState(SURFACE.rate);
  const [yoy, setYoy] = useState(false);

  const { bars, metersWithoutTou } = useMemo(
    () => toChartBars(filterMeters(meters, { entity, ranch, rate })),
    [meters, entity, ranch, rate],
  );

  const pairs = useMemo(() => yoyPairs(bars), [bars]);
  const comparing = yoy && pairs.length > 0;

  // In compare mode the chart narrows to the bars that HAVE a prior-year equivalent; otherwise
  // every bar renders. Priors are looked up by object identity, so a rebill sharing a close
  // instant cannot cross-wire pairs.
  const shown = comparing ? pairs.map((p) => p.current) : bars;
  const priorByBar = useMemo(() => new Map(pairs.map((p) => [p.current, p.prior])), [pairs]);

  // Which TOU buckets actually appear, in stack order (cheap hours at the base). The series and the
  // legend both read from this, so a bucket never shows a swatch it has no dollars for.
  const presentBuckets = useMemo(() => {
    const present = new Set<TouBucket>();
    for (const bar of shown) for (const seg of bar.segments) present.add(seg.bucket);
    return BUCKET_ORDER.filter((b) => present.has(b));
  }, [shown]);

  // recharts rows: one per cycle, each present bucket's cents as its own key (0 when absent so the
  // stack stays aligned), the prior-year total alongside in compare mode.
  const data = useMemo(
    () =>
      shown.map((bar: ChartBar) => {
        const row: Record<string, string | number> = {
          key: bar.key,
          label: bar.label.split(" ")[0] ?? bar.label,
        };
        for (const bucket of presentBuckets) row[bucket] = 0;
        for (const seg of bar.segments) row[seg.bucket] = seg.cents;
        if (comparing) row.prior = priorByBar.get(bar)?.totalCents ?? 0;
        return row;
      }),
    [shown, presentBuckets, comparing, priorByBar],
  );

  const series = useMemo<BarSeries[]>(() => {
    const touSeries = presentBuckets.map((bucket) => ({
      key: bucket,
      label: t.buckets[bucket],
      color: BUCKET_FILL[bucket],
      stackId: "spend",
    }));
    return comparing
      ? [...touSeries, { key: "prior", label: t.priorLabel, color: PRIOR_FILL, stackId: "prior" }]
      : touSeries;
  }, [presentBuckets, comparing]);

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
          <Button
            type="button"
            variant="outline"
            onClick={clearAll}
            className="min-h-[44px] rounded-[var(--radius-control)] border-outline-variant px-4 type-body-md text-on-surface hover:bg-surface-container-low"
          >
            {en.shell.filter.clear}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section id="energy-lens" aria-label={t.caption} className="scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
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

      <div className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4 shadow-e1">
        <SpendBarChart
          data={data}
          series={series}
          ariaLabel={t.caption}
          valueFormatter={formatUsdWhole}
        />
        {metersWithoutTou > 0 && (
          <p className="mt-2 type-caption text-on-surface-variant">{t.withoutTou(metersWithoutTou)}</p>
        )}
      </div>
    </section>
  );
}
