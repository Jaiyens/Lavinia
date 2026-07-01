import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui";
import { en, lbs } from "@/copy/en";
import type { CropYearSummary } from "@/lib/crops/views";

// The crop KPI strip (Phase 6): four tiles for the current season — produced, committed, in pool,
// unsold. Every figure is a field of the CropYearSummary (summed by cropYearSummary, never here);
// this Server Component only formats with lbs() and lays out. The Produced tile carries its
// provenance: a "Packer settled" / "Almond Logic estimate" tag so an estimate is never read as a
// final, and the settlement gap line whenever a settlement has moved the estimate. Unsold reads an
// honest "oversold" note when negative (the figure is never clamped). Tabular figures (.tnum).

const t = en.crops.kpi;

function KpiTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="min-h-[6rem] justify-start gap-0 overflow-visible rounded-[var(--radius-control)] p-4">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      {children}
    </Card>
  );
}

export function CropKpis({ summary }: { summary: CropYearSummary }) {
  const oversold = summary.unsoldPounds < 0;
  const gap = summary.gapPounds;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile label={t.producedLabel}>
        <span className="type-headline mt-1 tnum text-on-surface">{lbs(summary.producedPounds)}</span>
        {/* Provenance: a settled total is a packer final; otherwise it is clearly an estimate. */}
        <Badge variant={summary.allSettled ? "default" : "outline"} className="mt-2">
          {summary.allSettled ? t.settled : t.estimate}
        </Badge>
        {/* The gap a settlement moved the estimate by, signed, shown whenever one has landed. */}
        {gap !== null && (
          <span className="mt-1.5 type-caption text-on-surface-variant">
            {t.gap(gap > 0 ? `+${lbs(gap)}` : lbs(gap))}
          </span>
        )}
      </KpiTile>

      <KpiTile label={t.committedLabel}>
        <span className="type-headline mt-1 tnum text-on-surface">{lbs(summary.committedPounds)}</span>
      </KpiTile>

      <KpiTile label={t.poolLabel}>
        <span className="type-headline mt-1 tnum text-on-surface">{lbs(summary.poolPounds)}</span>
      </KpiTile>

      <KpiTile label={t.unsoldLabel}>
        <span className={`type-headline mt-1 tnum ${oversold ? "text-alert" : "text-on-surface"}`}>
          {lbs(summary.unsoldPounds)}
        </span>
        {oversold && <span className="mt-1.5 type-caption text-alert">{t.oversold}</span>}
      </KpiTile>
    </div>
  );
}
