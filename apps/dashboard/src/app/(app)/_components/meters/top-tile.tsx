"use client";

import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { en } from "@/copy/en";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import type { BoardSummary } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// The prominent TOP TILE that answers "do I need to pay attention right now?": how many meters
// are at risk, the single most urgent meter called out with the dollar consequence of crossing
// its peak, the running cycle demand total + where it is headed, and the plain-language daily
// risk read. Deliberately NO single farm-wide distance-to-next-peak number (demand is per meter);
// the only farm-wide figures are dollar roll-ups + counts.

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
  const accent = RISK_STYLE[summary.worst];
  const urgent = summary.urgent;
  const lockedCents = centsFromDollars(summary.cycleDemandLockedUsd);
  const headedCents = centsFromDollars(summary.cycleDemandHeadedUsd);
  const headed = headedCents > lockedCents;
  const readStyle = READ_STYLE[summary.read.level];

  return (
    <section
      className="rounded-[var(--radius-lg)] border bg-surface-container-lowest p-5 shadow-e2"
      style={{ borderColor: allClear ? "var(--outline-variant)" : accent.border }}
      aria-label={m.top.readEyebrow}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* Left: the attention headline + most urgent meter. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            {allClear ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "var(--primary)" }} aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: accent.dot }} aria-hidden />
            )}
            <h2 className="type-headline text-on-surface">
              {allClear ? m.top.allClearTitle : m.top.atRisk(summary.atRiskCount)}
            </h2>
          </div>

          {summary.settingNewPeakCount > 0 && (
            <p className="type-body-md font-semibold" style={{ color: RISK_STYLE.danger.text }}>
              {m.top.settingNow(summary.settingNewPeakCount)}
            </p>
          )}

          {allClear ? (
            <p className="type-body-md text-on-surface-variant">{m.top.allClearBody}</p>
          ) : (
            urgent !== null && (
              <button
                type="button"
                onClick={() => onOpenUrgent(urgent.meter.id)}
                className="rounded-[var(--radius-lg)] border p-3 text-left transition-colors hover:bg-surface-container-low"
                style={{ borderColor: RISK_STYLE[urgent.level].border, background: RISK_STYLE[urgent.level].bg }}
              >
                <p className="type-label-caps" style={{ color: RISK_STYLE[urgent.level].text }}>
                  {m.top.urgentEyebrow}
                </p>
                <p className="mt-0.5 type-body-md text-on-surface">
                  {urgent.settingNewPeak
                    ? m.top.urgentConsequenceOver(
                        urgent.meter.name,
                        formatUsdWhole(centsFromDollars(urgent.crossPeakCostUsd)),
                      )
                    : m.top.urgentConsequence(
                        urgent.meter.name,
                        formatUsdWhole(centsFromDollars(urgent.crossPeakCostUsd)),
                      )}
                </p>
                <p className="mt-1 type-caption text-on-surface-variant">
                  {m.top.headroomLabel}: {Math.max(0, Math.round(urgent.headroomKw))} {m.chart.kwAxis}
                </p>
              </button>
            )
          )}
        </div>

        {/* Middle: the running cycle demand total + where it is headed. */}
        <div className="flex flex-col justify-center gap-3 border-outline-variant lg:w-56 lg:border-l lg:pl-5">
          <div>
            <p className="type-caption text-on-surface-variant">{m.top.lockedLabel}</p>
            <p className="type-display-lg tabular-nums text-on-surface">{formatUsdWhole(lockedCents)}</p>
          </div>
          {headed && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 shrink-0" style={{ color: RISK_STYLE.danger.text }} aria-hidden />
              <div>
                <p className="type-caption text-on-surface-variant">{m.top.headedLabel}</p>
                <p className="type-num font-semibold tabular-nums" style={{ color: RISK_STYLE.danger.text }}>
                  {formatUsdWhole(headedCents)}
                </p>
              </div>
            </div>
          )}
          {!headed && <p className="type-caption text-on-surface-variant">{m.top.headedFlat}</p>}
        </div>
      </div>

      {/* The daily risk read, full width below. */}
      <div
        className="mt-4 rounded-[var(--radius-lg)] p-3"
        style={{ background: readStyle.bg }}
      >
        <p className="type-label-caps" style={{ color: readStyle.text }}>
          {m.top.readEyebrow}
        </p>
        <p className="mt-0.5 type-body-md text-on-surface">{summary.read.line}</p>
      </div>
    </section>
  );
}
