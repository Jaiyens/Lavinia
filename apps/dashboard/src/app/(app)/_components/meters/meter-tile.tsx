"use client";

import { useMemo } from "react";
import { en } from "@/copy/en";
import { meterDayCurve, type MeterRisk } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// One meter as a calm SQUARE tile, readable at a glance. The card itself is neutral (hairline
// border, no risk-colored fill/border) so the board never looks like a wall of red - color lives
// only in a small status dot and the thin gauge bar. The gauge: the fill is the meter's current
// draw, a tick marks this cycle's peak-so-far (its ceiling), and the empty space to the tick IS the
// headroom. A meter actually OVER its peak (rare - a new demand charge being set now) overshoots the
// tick in a solid alert red and is the only tile whose headline number turns red.
//
// CRITICAL: each gauge is scaled to THIS meter's own ceiling (tick fixed at 80%), never a shared kW
// axis - a 5 kW shop and a 200 kW pump near their own ceilings read equally full. A little track room
// past the tick holds the overshoot. (No group/farm gauge exists; demand is billed per meter.)

const m = en.meters;
const TICK_AT = 0.8;

const kw = (n: number): string => `${Math.round(n)}`;
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

/** A tiny polyline of the meter's representative day curve - its direction (climbing vs already
 *  spiked and falling) is the point. */
function Sparkline({ points, color }: { points: { minute: number; kw: number }[]; color: string }) {
  const d = useMemo(() => {
    if (points.length === 0) return "";
    const max = Math.max(...points.map((p) => p.kw), 1);
    const n = points.length;
    return points
      .map((p, i) => {
        const x = (i / (n - 1)) * 100;
        const y = 20 - (p.kw / max) * 18 - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

export function MeterTile({
  risk,
  groupName,
  onOpen,
}: {
  risk: MeterRisk;
  groupName: string;
  onOpen: () => void;
}) {
  const meter = risk.meter;
  const style = RISK_STYLE[risk.level];
  const over = risk.settingNewPeak;

  const ceiling = Math.max(meter.peakSoFarKw, 0);
  const current = Math.max(meter.currentKw, 0);
  const trackMax = ceiling > 0 ? ceiling / TICK_AT : Math.max(current, 1);
  const fillPct = clamp((current / trackMax) * 100, 0, 100);
  const tickPct = ceiling > 0 ? TICK_AT * 100 : 100;
  const basePct = Math.min(fillPct, tickPct);
  const overPct = Math.max(0, fillPct - tickPct);

  const curve = useMemo(() => meterDayCurve(meter), [meter]);
  const name = displayName(meter.name, groupName);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={meter.name}
      aria-label={`${meter.name}, ${kw(current)} ${m.chart.kwAxis}, ${m.tile.openDetail}`}
      className="group flex aspect-square w-full flex-col justify-between rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-3 text-left transition-colors hover:bg-surface-container-low"
    >
      {/* Name + a small status dot (the only always-on color). */}
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: style.dot }} />
        <span className="min-w-0 line-clamp-2 type-body-sm font-semibold leading-tight text-on-surface">{name}</span>
      </div>

      {/* Headline: current draw. Neutral, except the rare meter actually over its peak. */}
      <div className="leading-none">
        <span
          className="type-num text-[1.7rem] font-bold tabular-nums"
          style={{ color: over ? style.text : "var(--on-surface)" }}
        >
          {kw(current)}
        </span>
        <span className="ml-1 type-caption font-medium text-on-surface-variant">{m.chart.kwAxis}</span>
        <span className="mt-0.5 block type-label-caps text-on-surface-variant">{m.tile.currentDraw}</span>
      </div>

      <Sparkline points={curve.points} color={style.dot} />

      {/* Gauge + the headroom as a quiet caption reinforcing the visible gap. */}
      <div className="flex flex-col gap-1">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${basePct}%`, background: style.dot }} />
          {over && overPct > 0 && (
            <div className="absolute inset-y-0" style={{ left: `${tickPct}%`, width: `${overPct}%`, background: "var(--alert)" }} />
          )}
          {ceiling > 0 && (
            <span
              aria-hidden
              className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full"
              style={{ left: `calc(${tickPct}% - 1px)`, background: "color-mix(in srgb, var(--on-surface) 55%, transparent)" }}
            />
          )}
        </div>
        <span className="type-caption text-on-surface-variant">
          {over ? m.tile.overPeak : `${kw(risk.headroomKw)} ${m.chart.kwAxis} ${m.tile.headroom.toLowerCase()}`}
        </span>
      </div>
    </button>
  );
}
