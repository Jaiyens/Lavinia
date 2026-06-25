"use client";

import { useMemo } from "react";
import { en } from "@/copy/en";
import { synthesizeDay } from "@/lib/energy/load-shape";
import { SpendAreaChart } from "@/components/charts/spend-area-chart";

// The intra-day load-curve graph on the Energy meter drawer. Given a meter's billed peak kW (real),
// it synthesizes a believable 15-minute day shape (representative, pinned so the curve's max === the
// peak). Now rendered with the shared shadcn/recharts area chart (the same component as the Home PG&E
// spend graph), so the meter graph matches the rest of the app. Deterministic by `seed` (the meter
// id), so a meter always draws the same shape.
//
// HONESTY: this is a REPRESENTATIVE intraday shape anchored to the REAL billed peak; swap
// synthesizeDay for real Green Button 15-minute interval data once it's loaded.

const c = en.shell.drawer;

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
  const points = useMemo(() => {
    const { peakAtMinute, loadFactor } = shapeFromSeed(seed);
    return synthesizeDay({ peakKw, peakAtMinute, loadFactor, seed }).points.map((p) => ({
      label: clockLabel(p.minute),
      value: Math.round(p.kw),
    }));
  }, [peakKw, seed]);

  return (
    <SpendAreaChart
      points={points}
      seriesLabel={c.curveTitle}
      ariaLabel={c.curveAria}
      valueFormatter={(v) => `${v.toLocaleString()} kW`}
      heightClass="h-[200px]"
    />
  );
}
