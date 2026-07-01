"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { lbs } from "@/copy/en";
import { cn } from "@/lib/cn";
import type { VarietyWeight } from "@/lib/crops/deliveries";

// Delivery weight by variety (the Almond Logic "Field Percentages by Delivery Weight" pie, re-skinned
// in the Terra palette). Net pounds per variety are precomputed by varietyWeights(); this component
// only renders. Warm --chart-1..5 tokens, with a plain-English legend (variety, pounds, share).

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function colorFor(i: number): string {
  return COLORS[i % COLORS.length] ?? "var(--chart-1)";
}

export function CropVarietyPie({ data }: { data: VarietyWeight[] }) {
  const total = useMemo(() => data.reduce((a, d) => a + d.pounds, 0), [data]);

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 shadow-e1">
        <p className="type-body-md text-on-surface-variant">No deliveries to chart.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-4 shadow-e1">
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data}
                dataKey="pounds"
                nameKey="variety"
                innerRadius={62}
                outerRadius={100}
                paddingAngle={2}
                stroke="var(--surface-container-lowest)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={d.variety} fill={colorFor(i)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="type-label-caps text-on-surface-variant">Total net</span>
            <span className="type-num tnum text-on-surface">{lbs(total)}</span>
          </div>
        </div>
        <ul className="space-y-1.5">
          {data.map((d, i) => {
            const pct = Math.round((d.pounds / total) * 100);
            return (
              <li key={d.variety} className="flex items-center gap-2 text-on-surface">
                <span
                  className={cn("inline-block h-3 w-3 shrink-0 rounded-[3px]")}
                  style={{ backgroundColor: colorFor(i) }}
                  aria-hidden
                />
                <span className="type-body-md min-w-0 flex-1 truncate">{d.variety}</span>
                <span className="type-num tnum text-on-surface-variant">{lbs(d.pounds)}</span>
                <span className="type-caption tnum w-9 text-right text-on-surface-variant/80">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
