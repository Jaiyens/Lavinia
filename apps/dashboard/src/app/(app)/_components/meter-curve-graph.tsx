"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { en } from "@/copy/en";
import { synthesizeDay } from "@/lib/energy/load-shape";

// The intra-day load-curve graph (carried over from the old Meters detail) reused on the Energy meter
// drawer. Given a meter's billed peak kW (real), it synthesizes a believable 15-minute day shape
// (representative, pinned so the curve's max === the peak) with a dashed ceiling line at the peak.
// Deterministic by `seed` (the meter id), so a meter always draws the same shape. Pure client SVG via
// visx scales (mirrors the app's other charts).
//
// HONESTY: this is a REPRESENTATIVE intraday shape anchored to the REAL billed peak; swap synthesizeDay
// for real Green Button 15-minute interval data once it's loaded.

const c = en.shell.drawer;
const MARGIN = { top: 14, right: 14, bottom: 24, left: 40 };
const HEIGHT = 200;

function clockLabel(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const ampm = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${ampm}`;
}

// Deterministic hash -> a peak hour (13:00-18:00) + load factor (0.30-0.55) per meter, so different
// meters draw different believable shapes without any random (stable across renders/SSR).
function shapeFromSeed(seed: string): { peakAtMinute: number; loadFactor: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const peakHour = 13 + ((h >>> 3) % 6);
  const loadFactor = 0.3 + ((h >>> 7) % 26) / 100;
  return { peakAtMinute: peakHour * 60, loadFactor };
}

export function MeterCurveGraph({ peakKw, seed }: { peakKw: number; seed: string }) {
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

  const points = useMemo(() => {
    const { peakAtMinute, loadFactor } = shapeFromSeed(seed);
    return synthesizeDay({ peakKw, peakAtMinute, loadFactor, seed }).points;
  }, [peakKw, seed]);

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxKw = Math.max(peakKw, 1);
  const x = scaleLinear<number>({ domain: [0, 1440], range: [0, innerW] });
  const y = scaleLinear<number>({ domain: [0, maxKw * 1.08], range: [innerH, 0], nice: true });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)},${y(p.kw).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const area = `${path} L${x(last?.minute ?? 1425).toFixed(1)},${innerH} L${x(0).toFixed(1)},${innerH} Z`;
  const ticks = y.ticks(4);

  return (
    <div
      ref={wrapRef}
      className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low p-3"
    >
      {width > MARGIN.left + MARGIN.right && (
        <svg width={width} height={HEIGHT} role="img" aria-label={c.curveAria}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {ticks.map((tk) => (
              <g key={tk} transform={`translate(0,${y(tk)})`}>
                <line x1={0} x2={innerW} stroke="var(--outline-variant)" strokeWidth={1} />
                <text x={-8} dy="0.32em" textAnchor="end" className="tnum" fontSize={10} fill="var(--on-surface-variant)">
                  {Math.round(tk)}
                </text>
              </g>
            ))}

            <path d={area} fill="var(--primary)" opacity={0.12} />
            <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} />

            {/* Ceiling: the meter's billed peak. */}
            <line
              x1={0}
              x2={innerW}
              y1={y(peakKw)}
              y2={y(peakKw)}
              stroke="var(--primary)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text x={innerW} y={y(peakKw) - 5} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--on-surface)">
              {c.curveCeiling(Math.round(peakKw))}
            </text>

            {[360, 720, 1080, 1380].map((min) => (
              <text key={min} x={x(min)} y={innerH + 16} textAnchor="middle" fontSize={9} fill="var(--on-surface-variant)">
                {clockLabel(min)}
              </text>
            ))}
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--outline)" strokeWidth={1} />
          </g>
        </svg>
      )}
    </div>
  );
}
