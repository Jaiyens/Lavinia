// The two-rate proof (Feature B): the SAME cycle's usage priced under the current rate and
// the recommended rate, broken into energy / demand / service and totalled, with the saving
// called out. The whole point in one table: identical usage, two rates, different cost. The
// current column reconciles to the printed bill - when our model of the current rate is within
// tolerance we show the billed total and note the match; when it deviates we still show the
// billed figure and note the model delta, never a number that contradicts the bill. Server
// component, plain SVG-free markup, money via the shared formatter.

import { formatUsd } from "@/lib/format/money";
import { en } from "@/copy/en";
import type { CyclePriceBreakdown } from "@/lib/energy/rates";

const t = en.proof;

/** One labelled row across the two columns. */
function Row({
  label,
  fromCents,
  toCents,
  strong,
}: {
  label: string;
  fromCents: number;
  toCents: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t border-outline-variant py-2 first:border-t-0 ${strong ? "font-medium" : ""}`}
    >
      <span className="type-body-md text-on-surface-variant">{label}</span>
      <span className="type-num tnum text-right text-on-surface">{formatUsd(fromCents)}</span>
      <span className="type-num tnum text-right text-primary">{formatUsd(toCents)}</span>
    </div>
  );
}

export function TwoRateCompare({
  fromSchedule,
  toSchedule,
  from,
  to,
  saveCents,
  /** The printed bill total, when present; the current total reconciles to it. */
  billedTotalCents,
  /** |modelled current - billed| / billed, when both exist. Drives the reconciliation note. */
  modelDeltaFraction,
  /** Within this fraction the model is treated as matching the bill. */
  tolerance,
}: {
  fromSchedule: string;
  toSchedule: string;
  from: CyclePriceBreakdown;
  to: CyclePriceBreakdown;
  saveCents: number;
  billedTotalCents: number | null;
  modelDeltaFraction: number | null;
  tolerance: number;
}) {
  const withinTolerance =
    modelDeltaFraction !== null && modelDeltaFraction <= tolerance && billedTotalCents !== null;
  // The current column's total: the billed figure when the model matches it (the bill is
  // truth), else the model's own total with a delta note below. Never a contradictory number.
  const currentTotalCents = withinTolerance ? billedTotalCents! : from.totalCents;

  const deltaPct =
    modelDeltaFraction !== null ? `${Math.round(modelDeltaFraction * 100)}%` : null;

  return (
    <div>
      <div
        className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 pb-2"
        role="table"
        aria-label={t.aria}
      >
        <span className="type-label-caps text-on-surface-variant">{en.proof.energyRow}</span>
        <span className="type-label-caps text-right text-on-surface-variant">
          {t.currentColumn(fromSchedule)}
        </span>
        <span className="type-label-caps text-right text-primary">
          {t.recommendedColumn(toSchedule)}
        </span>
      </div>

      <Row label={t.energyRow} fromCents={from.energyCents} toCents={to.energyCents} />
      <Row label={t.demandRow} fromCents={from.demandCents} toCents={to.demandCents} />
      <Row label={t.customerRow} fromCents={from.customerCents} toCents={to.customerCents} />
      <Row label={t.totalRow} fromCents={currentTotalCents} toCents={to.totalCents} strong />

      {/* The saving, the line the whole table exists to produce. */}
      <div className="mt-3 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-3 py-2.5">
        {saveCents > 0 ? (
          <p className="type-body-md font-medium text-on-surface">
            {t.saving(formatUsd(saveCents))}
          </p>
        ) : (
          <p className="type-body-md text-on-surface-variant">{t.noSaving}</p>
        )}
        {withinTolerance ? (
          <p className="type-caption mt-1 text-on-surface-variant">{t.billedNote}</p>
        ) : deltaPct !== null ? (
          <p className="type-caption mt-1 text-on-surface-variant">{t.modelNote(deltaPct)}</p>
        ) : null}
      </div>
    </div>
  );
}
