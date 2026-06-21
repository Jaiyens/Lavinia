"use client";

import { Gauge, Droplet, Wrench } from "lucide-react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { freshnessPhrase, type MeterRisk } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// One meter tile: current draw (TIMESTAMPED, never "live"), peak so far this cycle, and MOST
// PROMINENTLY the gap between them, color-coded by closeness to a new peak. Clicking opens the
// meter's detail drawer. Every kW here is this meter's own - there is no group/pooled figure.

const m = en.meters;

const KIND_ICON = { pump: Gauge, well: Droplet, shop: Wrench } as const;

function kw(n: number): string {
  return `${Math.round(n)}`;
}

export function MeterTile({
  risk,
  now,
  onOpen,
}: {
  risk: MeterRisk;
  now: Date;
  onOpen: () => void;
}) {
  const meter = risk.meter;
  const style = RISK_STYLE[risk.level];
  const Icon = KIND_ICON[meter.kind];
  const asOf = freshnessPhrase(meter.currentAsOf, now);

  // The gap headline: positive headroom shows "Room left N kW"; an over-peak meter shows it is
  // over its highest point (the most urgent state).
  const over = risk.settingNewPeak;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${meter.name}, ${m.tile.openDetail}`}
      className="group flex w-full flex-col gap-3 rounded-[var(--radius-lg)] border bg-surface-container-lowest p-4 text-left shadow-e1 transition-all hover:shadow-e2"
      style={{ borderColor: style.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
            style={{ background: style.bg }}
          >
            <Icon className="h-4 w-4" style={{ color: style.dot }} aria-hidden />
          </span>
          <span className="min-w-0 truncate type-body-md font-semibold text-on-surface">
            {meter.name}
          </span>
        </div>
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: style.dot }}
        />
      </div>

      {/* THE GAP, most prominent. */}
      <div
        className="rounded-[var(--radius-control)] px-3 py-2"
        style={{ background: style.bg }}
      >
        <p className="type-label-caps" style={{ color: style.text }}>
          {over ? m.tile.overPeak : m.tile.headroom}
        </p>
        <p className="type-num text-2xl font-bold tabular-nums" style={{ color: style.text }}>
          {over ? `+${kw(Math.abs(risk.headroomKw))}` : kw(risk.headroomKw)}{" "}
          <span className="text-base font-medium">{en.meters.chart.kwAxis}</span>
        </p>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="type-caption text-on-surface-variant">{m.tile.currentDraw}</p>
          <p className="type-num font-semibold tabular-nums text-on-surface">
            {kw(meter.currentKw)} {en.meters.chart.kwAxis}
          </p>
        </div>
        <div className="text-right">
          <p className="type-caption text-on-surface-variant">{m.tile.peakSoFar}</p>
          <p className="type-num font-semibold tabular-nums text-on-surface">
            {kw(meter.peakSoFarKw)} {en.meters.chart.kwAxis}
          </p>
        </div>
      </div>

      {/* The timestamp riding the current-draw figure: the ~1-day lag, made honest. */}
      <p className={cn("type-caption text-on-surface-variant")}>{m.tile.drawAsOf(asOf)}</p>
    </button>
  );
}
