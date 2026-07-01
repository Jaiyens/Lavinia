"use client";

import { useState } from "react";
import { en, num } from "@/copy/en";
import { cn } from "@/lib/cn";
import type { WorksheetSubtotal } from "@/lib/crops/worksheet";
import { yoyRatio, type YoyCell, type YoyRow } from "@/lib/crops/yoy";

// Year-over-year table: one measure across seasons, block + variety down. The measure toggle picks
// which figure the cells show; every figure is the season's own gated worksheet figure (this only
// formats). A "vs prior" delta (latest season over the one before it) shows for the weight measures;
// turnout has no delta column (a percentage already IS the comparison). A season with no data for a
// row shows a blank, never a fabricated zero.

const c = en.crops.worksheet.yoyView;

type Metric = "fieldWeightLb" | "hullerWeightLb" | "tgmLbs" | "turnoutPct";
const METRICS: { key: Metric; label: string }[] = [
  { key: "fieldWeightLb", label: c.metricField },
  { key: "hullerWeightLb", label: c.metricHuller },
  { key: "tgmLbs", label: c.metricTgm },
  { key: "turnoutPct", label: c.metricTurnout },
];

function cellValue(cell: YoyCell | undefined, metric: Metric): string {
  if (!cell) return c.noData;
  const v = cell[metric];
  if (v === null) return c.noData;
  return metric === "turnoutPct"
    ? `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`
    : num(v);
}

function subtotalValue(st: WorksheetSubtotal | undefined, metric: Metric): string {
  if (!st) return c.noData;
  const v =
    metric === "turnoutPct" ? st.turnoutPct : metric === "tgmLbs" ? st.tgmLbs : st[metric];
  if (v === null || v === undefined) return c.noData;
  return metric === "turnoutPct"
    ? `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`
    : num(v);
}

const NUM = "px-3 py-2 text-right tnum whitespace-nowrap";
const TXT = "px-3 py-2 text-left whitespace-nowrap";

export function YoyTable({
  years,
  rows,
  farmByYear,
}: {
  years: readonly number[];
  rows: readonly YoyRow[];
  farmByYear: Record<number, WorksheetSubtotal>;
}) {
  const [metric, setMetric] = useState<Metric>("fieldWeightLb");
  const showDelta = metric !== "turnoutPct" && years.length >= 2;

  return (
    <div className="flex flex-col gap-4">
      {/* Measure toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-label-caps text-on-surface-variant">{c.metricLabel}</span>
        <div className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-outline-variant">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              aria-pressed={metric === m.key}
              className={cn(
                "px-3 py-1.5 type-label-caps transition-colors",
                metric === m.key
                  ? "bg-primary text-on-primary"
                  : "bg-surface text-on-surface-variant hover:text-on-surface",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-outline-variant">
        <table className="w-full border-collapse type-body-sm">
          <thead>
            <tr className="border-b border-outline-variant type-label-caps text-on-surface-variant">
              <th scope="col" className={TXT}>{en.crops.worksheet.table.columns.block}</th>
              <th scope="col" className={TXT}>{en.crops.worksheet.table.columns.variety}</th>
              {years.map((y) => (
                <th key={y} scope="col" className={cn(NUM, "tnum")}>{y}</th>
              ))}
              {showDelta ? <th scope="col" className={NUM}>{c.deltaHeader}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ratio = showDelta
                ? yoyRatio(r, years, 0, metric as "fieldWeightLb" | "hullerWeightLb" | "tgmLbs")
                : null;
              return (
                <tr key={`${r.blockId} ${r.variety}`} className="border-b border-outline-variant/40 last:border-0">
                  <th scope="row" className={cn(TXT, "type-label-md font-medium text-on-surface")}>{r.blockName}</th>
                  <td className={cn(TXT, "text-on-surface-variant")}>{r.variety}</td>
                  {years.map((y) => (
                    <td key={y} className={NUM}>{cellValue(r.byYear[y], metric)}</td>
                  ))}
                  {showDelta ? (
                    <td className={cn(NUM, ratio != null && ratio < 1 && "text-on-surface-variant")}>
                      {ratio === null ? c.noData : c.deltaValue(ratio)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-outline bg-surface-container-low type-label-md font-semibold text-on-surface">
              <th scope="row" className={TXT} colSpan={2}>{c.farmTotal}</th>
              {years.map((y) => (
                <td key={y} className={NUM}>{subtotalValue(farmByYear[y], metric)}</td>
              ))}
              {showDelta ? <td className={NUM} /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
