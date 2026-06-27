"use client";

import { useMemo } from "react";
import { en, lbs } from "@/copy/en";
import { SpendBarChart, type BarSeries } from "@/components/charts/spend-bar-chart";
import type { CropYearBar } from "@/lib/crops/views";

// The year-over-year chart (Phase 6): produced / committed / pool / unsold pounds per crop year,
// one grouped set of bars per season. Numbers are precomputed by cropYearBars() — this component
// only maps them into recharts rows and formats with lbs(). Warm agricultural palette via the shared
// --chart-1..5 tokens, rendered through the shared shadcn/recharts bar chart so the crop chart and
// the energy chart can never drift to a second chart implementation.

const t = en.crops.chart;

// Each measure is its own series (grouped bars), each with its own warm token. No stacking — these
// are four distinct quantities for a season, not parts of one whole, so they sit side by side.
const SERIES: readonly BarSeries[] = [
  { key: "produced", label: t.producedLabel, color: "var(--chart-1)", stackId: "produced" },
  { key: "committed", label: t.committedLabel, color: "var(--chart-2)", stackId: "committed" },
  { key: "pool", label: t.poolLabel, color: "var(--chart-3)", stackId: "pool" },
  { key: "unsold", label: t.unsoldLabel, color: "var(--chart-4)", stackId: "unsold" },
];

export function CropYoyChart({ bars }: { bars: CropYearBar[] }) {
  const data = useMemo(
    () =>
      bars.map((bar) => ({
        key: String(bar.cropYear),
        label: String(bar.cropYear),
        produced: bar.producedPounds,
        committed: bar.committedPounds,
        pool: bar.poolPounds,
        unsold: bar.unsoldPounds,
      })),
    [bars],
  );

  if (bars.length === 0) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 shadow-e1">
        <p className="type-body-md text-on-surface-variant">{t.empty}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4 shadow-e1">
      <SpendBarChart data={data} series={[...SERIES]} ariaLabel={t.caption} valueFormatter={lbs} />
    </div>
  );
}
