"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { X } from "lucide-react";
import { en } from "@/copy/en";
import { formatUsd, formatUsdWhole } from "@/lib/format/money";
import { centsFromDollars } from "@/lib/format/money";
import { meterDayCurve, type MeterRisk } from "@/lib/meters";
import { freshnessPhrase } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";

// The meter detail drawer: the day's 15-minute load curve with a HORIZONTAL CEILING LINE at the
// meter's peak-so-far (the demand ceiling), the latest reading marked, plus the plain statement
// of this cycle's demand charge and exactly what set it. visx scales over plain SVG, every fill a
// token (mirrors chart-lens.tsx). The curve's max === the ceiling by construction (synthesizeDay
// reconciles to the billed peak), so the line sits exactly on the curve's highest point.

const m = en.meters;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 44 };
const HEIGHT = 240;

/** Minute-of-day -> "3:30pm" style label (the farmer's clock, not 24h jargon). */
function clockLabel(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const mm = minute % 60;
  const ampm = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2, "0")}${ampm}`;
}

export function MeterDetail({
  risk,
  now,
  onClose,
}: {
  risk: MeterRisk;
  now: Date;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close on Escape, like a standard drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meter = risk.meter;
  const curve = useMemo(() => meterDayCurve(meter), [meter]);
  const style = RISK_STYLE[risk.level];

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxKw = Math.max(meter.peakSoFarKw, ...curve.points.map((p) => p.kw), 1);

  const x = scaleLinear<number>({ domain: [0, 1440], range: [0, innerW] });
  const y = scaleLinear<number>({ domain: [0, maxKw * 1.08], range: [innerH, 0], nice: true });

  const path = curve.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)},${y(p.kw).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${x(curve.points[curve.points.length - 1]?.minute ?? 1425).toFixed(1)},${innerH} L${x(0).toFixed(1)},${innerH} Z`;

  // The chart's demand charge statement uses the SAME locked figure as the board (peakSoFar x $/kW).
  const chargeCents = centsFromDollars(risk.lockedDemandUsd);
  const perKwCents = centsFromDollars(risk.dollarsPerKw);
  const peakClock = clockLabel(meter.peakAtMinute);
  const asOf = freshnessPhrase(meter.currentAsOf, now);

  const ticks = y.ticks(4);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-on-surface/30"
      role="dialog"
      aria-modal="true"
      aria-label={meter.name}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface-container-lowest shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant p-5">
          <div className="min-w-0">
            <p className="type-label-caps text-on-surface-variant">{m.tile[`kind${meter.kind === "pump" ? "Pump" : meter.kind === "well" ? "Well" : "Shop"}`]}</p>
            <h2 className="type-title text-on-surface">{meter.name}</h2>
          </div>
          <button
            type="button"
            aria-label={m.detail.back}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {/* The day curve with the ceiling line. */}
          <section>
            <h3 className="mb-1 type-body-md font-semibold text-on-surface">{m.detail.curveTitle}</h3>
            <div
              ref={wrapRef}
              className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low p-3"
            >
              {width > MARGIN.left + MARGIN.right && (
                <svg width={width} height={HEIGHT}>
                  <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                    {ticks.map((tk) => (
                      <g key={tk} transform={`translate(0,${y(tk)})`}>
                        <line x1={0} x2={innerW} stroke="var(--outline-variant)" strokeWidth={1} />
                        <text x={-8} dy="0.32em" textAnchor="end" className="tnum" fontSize={11} fill="var(--on-surface-variant)">
                          {Math.round(tk)}
                        </text>
                      </g>
                    ))}

                    {/* Area + line of the day's draw. */}
                    <path d={area} fill="var(--primary)" opacity={0.12} />
                    <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />

                    {/* THE CEILING: the meter's peak-so-far, the demand ceiling. */}
                    <line
                      x1={0}
                      x2={innerW}
                      y1={y(meter.peakSoFarKw)}
                      y2={y(meter.peakSoFarKw)}
                      stroke={style.border}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                    <text x={innerW} y={y(meter.peakSoFarKw) - 6} textAnchor="end" fontSize={11} fontWeight={600} fill={style.text}>
                      {m.chart.ceiling} {Math.round(meter.peakSoFarKw)} {m.chart.kwAxis}
                    </text>

                    {/* The latest reading (current draw) as a marker on the curve's peak time anchor. */}
                    <circle cx={x(meter.peakAtMinute)} cy={y(meter.peakSoFarKw)} r={3.5} fill={style.dot} />

                    {/* Time axis: a few clock ticks. */}
                    {[360, 720, 1080, 1380].map((min) => (
                      <text key={min} x={x(min)} y={innerH + 18} textAnchor="middle" fontSize={10} fill="var(--on-surface-variant)">
                        {clockLabel(min)}
                      </text>
                    ))}
                    <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--outline)" strokeWidth={1} />
                  </g>
                </svg>
              )}
            </div>
            <p className="mt-1 type-caption text-on-surface-variant">
              {m.chart.kwAxis} {m.detail.nowLabel.toLowerCase()} {m.tile.drawAsOf(asOf)}
            </p>
          </section>

          {/* The plain demand-charge statement. */}
          <section className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low p-4">
            <h3 className="type-body-md font-semibold text-on-surface">{m.detail.chargeTitle}</h3>
            <p className="mt-1 type-body-md text-on-surface">
              {m.detail.chargeSet(formatUsd(chargeCents), `${Math.round(meter.peakSoFarKw)} ${m.chart.kwAxis}`, peakClock)}
            </p>
            <p className="mt-1 type-caption text-on-surface-variant">
              {m.detail.chargeRate(formatUsdWhole(perKwCents))}
            </p>
          </section>

          {/* The honest per-meter / cross-meter note. Stagger only on the SAME meter. */}
          <p className="type-caption text-on-surface-variant">
            {meter.kind === "pump" ? m.detail.sameMeterNote : m.detail.crossMeterNote}
          </p>
        </div>
      </div>
    </div>
  );
}
