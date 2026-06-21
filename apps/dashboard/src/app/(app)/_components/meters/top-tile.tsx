"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { en } from "@/copy/en";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import type { BoardSummary } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// The TOP TILE: one wide banner across the top of the board that answers "do I need to look right
// now?" before any meter. Two regions side by side (stacked on mobile):
//   1. Most urgent: the single meter closest to a costlier peak, with the dollar consequence. Click
//      to open its detail. Falls back to an all-clear state when nothing is at risk.
//   2. Today's read: the one-line daily risk word + plain-English line, tinted by the day's level.
// Deliberately spare: no cycle-total column, no legend. Any meter's detail is one tap away below.

const m = en.meters;

const READ_STYLE: Record<BoardSummary["read"]["level"], { bg: string; text: string }> = {
  high: { bg: "var(--alert-container)", text: "var(--alert)" },
  moderate: { bg: "var(--gold)", text: "var(--on-surface)" },
  low: { bg: "var(--primary-container)", text: "var(--on-surface)" },
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
  const readStyle = READ_STYLE[summary.read.level];
  const urgentBorder = urgent ? RISK_STYLE[urgent.level] : null;

  return (
    <aside
      className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant md:grid-cols-2"
      aria-label={m.side.label}
    >
      {/* Most urgent. */}
      {allClear || urgent === null ? (
        <section className="bg-surface-container-lowest p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} aria-hidden />
            <p className="type-label-caps text-on-surface-variant">{m.side.urgentEyebrow}</p>
          </div>
          <p className="mt-1.5 type-title text-on-surface">{m.top.allClearTitle}</p>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => onOpenUrgent(urgent.meter.id)}
          className="bg-surface-container-lowest p-4 text-left transition-colors hover:bg-surface-container-low"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: urgentBorder?.dot }} aria-hidden />
            <p className="type-label-caps" style={{ color: urgentBorder?.text }}>
              {m.side.urgentEyebrow}
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="min-w-0 truncate type-title text-on-surface">{urgent.meter.name}</p>
            <p className="shrink-0 type-num font-semibold tabular-nums" style={{ color: RISK_STYLE.danger.text }}>
              {m.side.urgentAmount(formatUsdWhole(centsFromDollars(urgent.crossPeakCostUsd)))}
            </p>
          </div>
        </button>
      )}

      {/* Today's read. */}
      <section className="border-t border-outline-variant p-4 md:border-l md:border-t-0" style={{ background: readStyle.bg }}>
        <p className="type-label-caps" style={{ color: readStyle.text }}>
          {m.top.readEyebrow}
        </p>
        <p className="mt-1.5 type-body-md text-on-surface">{summary.read.line}</p>
      </section>
    </aside>
  );
}
