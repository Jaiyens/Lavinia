"use client";

import { type ReactNode, useMemo } from "react";
import { useQueryState } from "nuqs";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { cardClass } from "@/components/ui";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { filterMeters } from "@/lib/dashboard/table";
import type { MeterView } from "@/lib/dashboard/load";
import { Sparkline } from "./sparkline";

type Tone = "favorable" | "adverse" | "neutral";

// For spend and demand, a decrease is favorable (less money out). The biggest mover uses the same
// rule: a meter whose bill jumped is the thing to watch (clay), one that fell is good (green).
function toneFor(deltaCents: number | null): Tone {
  if (deltaCents === null || deltaCents === 0) return "neutral";
  return deltaCents < 0 ? "favorable" : "adverse";
}

const TONE_TEXT: Record<Tone, string> = {
  favorable: "text-money-positive",
  adverse: "text-alert",
  neutral: "text-on-surface-variant",
};

function Delta({ deltaCents, series }: { deltaCents: number | null; series?: number[] }) {
  if (deltaCents === null) return null;
  const tone = toneFor(deltaCents);
  const Icon = deltaCents < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {/* The sparkline stays neutral (the trend line is not the latest step's sign); only the
          delta value + arrow carry the favorable/adverse tone. */}
      {series && <Sparkline series={series} className="text-on-surface-variant" />}
      <span className={cn("flex items-center gap-1.5", TONE_TEXT[tone])}>
        <Icon size={14} aria-hidden />
        <span className="type-num">{formatUsd(Math.abs(deltaCents))}</span>
      </span>
      <span className="type-caption text-on-surface-variant">{en.shell.kpi.vsLast}</span>
    </div>
  );
}

function Card({
  label,
  onClick,
  ariaLabel,
  children,
}: {
  label: string;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cardClass({
        interactive: true,
        radius: "control",
        className: "flex min-h-[6rem] flex-col p-4 text-left",
      })}
    >
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      {children}
    </button>
  );
}

function scrollToLens(): void {
  document.getElementById("energy-lens")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// The KPI strip: a few compact cards above the lens (never a lone hero number). Receives the
// canonical MeterView[] and recomputes the pure rollups client-side under the active nuqs
// entity/ranch/rate filter (Story 2.6, FR-11): the cards and the table narrow through the
// same filterMeters predicate (the chart/map lenses adopt the same keys when they land).
// Every figure is reconciled-only and tabular.
// Tapping a card drives the lens to its story (spend/demand scroll; the mover opens its meter).
export function KpiStrip({ meters }: { meters: MeterView[] }) {
  const [entity] = useQueryState("entity");
  const [ranch] = useQueryState("ranch");
  const [rate] = useQueryState("rate");
  const [, setMeter] = useQueryState("meter");

  const { spend, demand, biggestMover } = useMemo(
    () => computeKpiStrip(filterMeters(meters, { entity, ranch, rate })),
    [meters, entity, ranch, rate],
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card label={en.shell.kpi.spendLabel} onClick={scrollToLens} ariaLabel={en.shell.kpi.spendAria}>
        {spend.coverage.loaded > 0 ? (
          <span className="type-headline mt-1 tnum text-on-surface">{formatUsd(spend.cents)}</span>
        ) : (
          // Nothing reconciled in view: withhold the figure, never a fabricated $0 (AR-15).
          // An empty FILTERED subset is the filter's doing, not missing bills - say so.
          <span className="type-body-md mt-2 text-on-surface-variant">
            {spend.coverage.total === 0 ? en.shell.kpi.noMetersInView : en.shell.kpi.spendNotLoaded}
          </span>
        )}
        <span className="type-caption mt-1 text-on-surface-variant">
          {en.shell.kpi.coverage(spend.coverage.loaded, spend.coverage.total)}
        </span>
        {/* Calm trend line only - no big red "vs last cycle" increase as the headline stat (the
            cost-increase delta read as alarming on a save-you-money product). */}
        {spend.coverage.loaded > 0 && spend.series.length > 1 && (
          <div className="mt-2">
            <Sparkline series={spend.series} className="text-on-surface-variant" />
          </div>
        )}
      </Card>

      <Card label={en.shell.kpi.demandLabel} onClick={scrollToLens} ariaLabel={en.shell.kpi.demandAria}>
        {demand.hasDemand ? (
          <>
            <span className="type-headline mt-1 tnum text-on-surface">{formatUsd(demand.cents)}</span>
            {demand.series.length > 1 && (
              <div className="mt-2">
                <Sparkline series={demand.series} className="text-on-surface-variant" />
              </div>
            )}
          </>
        ) : (
          <span className="type-body-md mt-2 text-on-surface-variant">{en.shell.kpi.noDemand}</span>
        )}
      </Card>

      {biggestMover && (
        <Card
          label={en.shell.kpi.moverLabel}
          onClick={() => {
            void setMeter(biggestMover.meterId);
            scrollToLens();
          }}
          ariaLabel={en.shell.kpi.moverAria(biggestMover.meterName)}
        >
          <span className="type-headline mt-1 text-on-surface">{biggestMover.meterName}</span>
          <Delta deltaCents={biggestMover.deltaCents} />
        </Card>
      )}
    </div>
  );
}
