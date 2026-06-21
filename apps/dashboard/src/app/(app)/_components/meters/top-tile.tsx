"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { en } from "@/copy/en";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import type { BoardSummary } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// The SIDE RAIL: two compact stat cards that answer "do I need to look right now?" at a glance.
//   1. Most urgent: the single meter closest to a costlier peak, with the dollar consequence.
//      Click to open its detail. Falls back to an all-clear card when nothing is at risk.
//   2. Today's read: the one-line daily risk word + plain-English line.
// Deliberately spare: no cycle-total column, no legend, no headroom sub-lines. The detail of any
// meter is one tap away in the main column.

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

  return (
    <aside className="flex flex-col gap-3" aria-label={m.side.label}>
      {/* Most urgent. */}
      {allClear || urgent === null ? (
        <section className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} aria-hidden />
            <p className="type-label-caps text-on-surface-variant">{m.side.urgentEyebrow}</p>
          </div>
          <p className="mt-1.5 type-body-md text-on-surface">{m.top.allClearTitle}</p>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => onOpenUrgent(urgent.meter.id)}
          className="rounded-[var(--radius-lg)] border bg-surface-container-lowest p-4 text-left transition-colors hover:bg-surface-container-low"
          style={{ borderColor: RISK_STYLE[urgent.level].border }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: RISK_STYLE[urgent.level].dot }} aria-hidden />
            <p className="type-label-caps" style={{ color: RISK_STYLE[urgent.level].text }}>
              {m.side.urgentEyebrow}
            </p>
          </div>
          <p className="mt-1.5 truncate type-title text-on-surface">{urgent.meter.name}</p>
          <p className="mt-0.5 type-num font-semibold tabular-nums" style={{ color: RISK_STYLE.danger.text }}>
            {m.side.urgentAmount(formatUsdWhole(centsFromDollars(urgent.crossPeakCostUsd)))}
          </p>
        </button>
      )}

      {/* Today's read. */}
      <section className="rounded-[var(--radius-lg)] p-4" style={{ background: readStyle.bg }}>
        <p className="type-label-caps" style={{ color: readStyle.text }}>
          {m.top.readEyebrow}
        </p>
        <p className="mt-1.5 type-body-md text-on-surface">{summary.read.line}</p>
      </section>
    </aside>
  );
}
