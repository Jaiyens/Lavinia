"use client";

import { en } from "@/copy/en";
import { type MeterRisk } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// One meter tile, pared to essentials: the meter name with its risk dot, and the ONE number that
// matters - the room left below its own highest point this cycle (or that it is over it). Clicking
// opens the meter's detail drawer for the full curve + charge story. Every kW here is this meter's
// own; there is no group/pooled figure.

const m = en.meters;

function kw(n: number): string {
  return `${Math.round(n)}`;
}

export function MeterTile({
  risk,
  onOpen,
}: {
  risk: MeterRisk;
  onOpen: () => void;
}) {
  const meter = risk.meter;
  const style = RISK_STYLE[risk.level];
  const over = risk.settingNewPeak;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${meter.name}, ${m.tile.openDetail}`}
      className="group flex w-full items-center gap-3 rounded-[var(--radius-lg)] border bg-surface-container-lowest p-3 text-left transition-colors hover:bg-surface-container-low"
      style={{ borderColor: style.border }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: style.dot }}
      />
      <span className="min-w-0 flex-1 truncate type-body-md font-semibold text-on-surface">
        {meter.name}
      </span>
      <span className="shrink-0 text-right">
        <span className="type-num font-semibold tabular-nums" style={{ color: style.text }}>
          {over ? `+${kw(Math.abs(risk.headroomKw))}` : kw(risk.headroomKw)}
          <span className="ml-0.5 type-caption font-medium">{m.chart.kwAxis}</span>
        </span>
        <span className="block type-caption text-on-surface-variant">
          {over ? m.tile.overPeak : m.tile.headroom}
        </span>
      </span>
    </button>
  );
}
