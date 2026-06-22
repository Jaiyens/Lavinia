"use client";

import { en } from "@/copy/en";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import type { BoardSummary } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// The two answer-first tiles, rendered as SQUARES that match the meter tiles so the whole board is
// one calm grid:
//   1. Most urgent: the single meter closest to a costlier peak + the dollar consequence (click to
//      open it). Falls back to an all-clear state.
//   2. Today's read: the daily risk word + plain-English line.
// Calm by design - neutral cards, a small status dot carries the level; no big red panels.

const m = en.meters;

const READ_DOT: Record<BoardSummary["read"]["level"], string> = {
  high: "var(--alert)",
  moderate: "var(--gold)",
  low: "var(--primary)",
};

export function TopTile({
  summary,
  onOpenUrgent,
}: {
  summary: BoardSummary;
  onOpenUrgent: (meterId: string) => void;
}) {
  const allClear = summary.atRiskCount === 0;
  const urgent = summary.urgent;

  return (
    <>
      {/* Most urgent. */}
      {allClear || urgent === null ? (
        <section className="flex aspect-square flex-col justify-between rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-3">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />
            <p className="type-label-caps text-on-surface-variant">{m.side.urgentEyebrow}</p>
          </div>
          <p className="type-body-md text-on-surface">{m.top.allClearTitle}</p>
          <span className="type-caption text-on-surface-variant">&nbsp;</span>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => onOpenUrgent(urgent.meter.id)}
          className="flex aspect-square flex-col justify-between rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-3 text-left transition-colors hover:bg-surface-container-low"
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: RISK_STYLE[urgent.level].dot }} />
            <p className="type-label-caps text-on-surface-variant">{m.side.urgentEyebrow}</p>
          </div>
          <div className="leading-tight">
            <p className="type-num text-[1.4rem] font-bold tabular-nums" style={{ color: RISK_STYLE.danger.text }}>
              {formatUsdWhole(centsFromDollars(urgent.crossPeakCostUsd))}
            </p>
            <p className="mt-0.5 type-caption text-on-surface-variant">{m.side.atRiskLabel}</p>
          </div>
          <p className="truncate type-body-sm font-semibold text-on-surface" title={urgent.meter.name}>
            {urgent.meter.name}
          </p>
        </button>
      )}

      {/* Today's read. */}
      <section className="flex aspect-square flex-col gap-2 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: READ_DOT[summary.read.level] }} />
          <p className="type-label-caps text-on-surface-variant">{m.top.readEyebrow}</p>
        </div>
        <p className="line-clamp-6 type-body-sm text-on-surface">{summary.read.line}</p>
      </section>
    </>
  );
}
