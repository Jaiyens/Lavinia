"use client";

import { useMemo } from "react";
import { en } from "@/copy/en";
import { freshnessPhrase, meterDayCurve, type MeterRisk } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// One meter tile, rendered as a horizontal GAUGE you can read at a glance instead of a row of
// numbers. The bar is the meter's current draw; a tick on the track marks this cycle's peak-so-far
// (the demand ceiling); the empty space between the fill and the tick IS the headroom (you see it,
// you don't decode a number). A meter setting a NEW peak right now overshoots the tick in an
// alarming hazard red, so "setting a peak" is something you watch happen.
//
// CRITICAL: each gauge is scaled to THIS meter's own ceiling (peakSoFar), never a shared/global kW
// axis. Risk is relative to each meter's own peak, so a 5 kW shop near its ceiling and a 200 kW pump
// near its ceiling read equally full. There is deliberately a little track room beyond the tick so
// an overshoot has somewhere to render. (No group/farm gauge exists; demand is billed per meter.)

const m = en.meters;

// The ceiling tick sits at this fraction of the track, leaving the remaining 20% as overshoot room.
const TICK_AT = 0.8;

function kw(n: number): string {
  return `${Math.round(n)}`;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Inside a group, drop the redundant group prefix: "Avenue 7 Pump 3" in group "Avenue 7" -> "Pump 3". */
function displayName(name: string, groupName: string): string {
  const prefix = groupName.trim();
  if (prefix.length > 0 && name.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
    const rest = name.slice(prefix.length).trim();
    if (rest.length > 0) return rest;
  }
  return name;
}

/** A minimal SVG polyline of the meter's representative day curve. Direction is the point: a meter
 *  climbing into its ceiling and one that already spiked and is falling read oppositely here. */
function Sparkline({ points, color }: { points: { minute: number; kw: number }[]; color: string }) {
  const d = useMemo(() => {
    if (points.length === 0) return "";
    const max = Math.max(...points.map((p) => p.kw), 1);
    const n = points.length;
    return points
      .map((p, i) => {
        const x = (i / (n - 1)) * 100;
        const y = 24 - (p.kw / max) * 22 - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-20" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function MeterTile({
  risk,
  groupName,
  now,
  onOpen,
}: {
  risk: MeterRisk;
  groupName: string;
  now: Date;
  onOpen: () => void;
}) {
  const meter = risk.meter;
  const style = RISK_STYLE[risk.level];
  const over = risk.settingNewPeak;

  const ceiling = Math.max(meter.peakSoFarKw, 0);
  const current = Math.max(meter.currentKw, 0);
  // Track scaled to THIS meter's ceiling: the tick is always at TICK_AT, so fullness is comparable
  // across meters of any size. With no ceiling on record, fill spans the track and there's no tick.
  const trackMax = ceiling > 0 ? ceiling / TICK_AT : Math.max(current, 1);
  const fillPct = clamp((current / trackMax) * 100, 0, 100);
  const tickPct = ceiling > 0 ? TICK_AT * 100 : 100;
  const basePct = Math.min(fillPct, tickPct);
  const overPct = Math.max(0, fillPct - tickPct);

  const curve = useMemo(() => meterDayCurve(meter), [meter]);
  const asOf = freshnessPhrase(meter.currentAsOf, now);
  const name = displayName(meter.name, groupName);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={meter.name}
      aria-label={`${meter.name}, ${kw(current)} ${m.chart.kwAxis} ${m.tile.currentDraw.toLowerCase()}, ${m.tile.openDetail}`}
      className="group flex w-full flex-col gap-2 rounded-[var(--radius-lg)] border bg-surface-container-lowest p-3 text-left transition-colors hover:bg-surface-container-low"
      style={{ borderColor: style.border }}
    >
      {/* Header: name (full, room to wrap) + the headline current draw. */}
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: style.dot }} />
          <span className="type-body-md font-semibold leading-tight text-on-surface">{name}</span>
        </span>
        <span className="shrink-0 text-right leading-none">
          <span className="type-num text-[1.15rem] font-bold tabular-nums" style={{ color: style.text }}>
            {kw(current)}
            <span className="ml-0.5 type-caption font-medium text-on-surface-variant">{m.chart.kwAxis}</span>
          </span>
          <span className="mt-0.5 block type-label-caps text-on-surface-variant">{m.tile.currentDraw}</span>
        </span>
      </div>

      {/* The gauge: fill = current draw, tick = ceiling, gap = headroom, overshoot = new peak. */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        {/* base fill, up to the ceiling, in the risk color */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${basePct}%`, background: style.dot }}
        />
        {/* overshoot beyond the ceiling: a pulsing hazard red, so a new peak is watched, not decoded */}
        {over && overPct > 0 && (
          <div
            className="absolute inset-y-0 animate-pulse"
            style={{
              left: `${tickPct}%`,
              width: `${overPct}%`,
              background:
                "repeating-linear-gradient(45deg, var(--alert) 0 5px, color-mix(in srgb, var(--alert) 55%, white) 5px 10px)",
            }}
          />
        )}
        {/* the ceiling tick: this cycle's peak-so-far */}
        {ceiling > 0 && (
          <span
            aria-hidden
            className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-on-surface"
            style={{ left: `calc(${tickPct}% - 1px)` }}
          />
        )}
      </div>

      {/* Secondary: the headroom (now reinforcing the visible gap) + the sparkline's direction. */}
      <div className="flex items-end justify-between gap-2">
        <span className="min-w-0">
          <span className="type-caption font-medium" style={{ color: over ? style.text : "var(--on-surface)" }}>
            {over ? m.tile.overPeak : `${kw(risk.headroomKw)} ${m.chart.kwAxis} ${m.tile.headroom.toLowerCase()}`}
          </span>
          <span className="block type-caption text-on-surface-variant">{m.tile.drawAsOf(asOf)}</span>
        </span>
        <Sparkline points={curve.points} color={style.dot} />
      </div>
    </button>
  );
}
