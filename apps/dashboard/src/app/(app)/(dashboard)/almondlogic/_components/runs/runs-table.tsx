"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { lbs } from "@/copy/en";
import type { RunInfo } from "@/lib/almond-portal/data";

// The Almond Logic "Runs" table, re-skinned in the Terra palette: one row per validated huller run,
// with its turnout (the percent of delivered weight that came back as edible meat). A clean sortable
// table - click any header to sort, numeric columns right-aligned with tabular figures. This
// component only formats; it never computes a pound or a percent. Runs are sparse, so the page owns
// the empty state and only mounts this when there is at least one row.

type SortKey =
  | "runId"
  | "validatedAt"
  | "field"
  | "variety"
  | "totalBins"
  | "loadWeight"
  | "binWeight"
  | "turnout";

type Column = {
  key: SortKey;
  header: string;
  numeric: boolean;
};

const COLUMNS: readonly Column[] = [
  { key: "runId", header: "Run", numeric: false },
  { key: "validatedAt", header: "Validated", numeric: false },
  { key: "field", header: "Field", numeric: false },
  { key: "variety", header: "Variety", numeric: false },
  { key: "totalBins", header: "Total Bins", numeric: true },
  { key: "loadWeight", header: "Load Weight", numeric: true },
  { key: "binWeight", header: "Bin Weight", numeric: true },
  { key: "turnout", header: "Turnout", numeric: true },
];

function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "-";
  }
}

function weightLabel(value: number | null): string {
  return value == null ? "-" : lbs(value);
}

function binsLabel(value: number | null): string {
  return value == null ? "-" : value.toLocaleString("en-US");
}

function turnoutLabel(value: number | null): string {
  return value == null ? "-" : `${value}%`;
}

// Nulls sort last regardless of direction; otherwise compare by the typed value.
function compare(a: RunInfo, b: RunInfo, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "en-US", { numeric: true });
}

export function RunsTable({ runs }: { runs: RunInfo[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("validatedAt");
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...runs];
    copy.sort((a, b) => {
      const order = compare(a, b, sortKey);
      return desc ? -order : order;
    });
    return copy;
  }, [runs, sortKey, desc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      setDesc(true);
    }
  };

  return (
    <div className="overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1">
      <table className="w-full border-collapse">
        <thead className="bg-surface-container-lowest">
          <tr>
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
                  className={cn(
                    "whitespace-nowrap border-b border-outline-variant px-3 py-2.5",
                    col.numeric ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 type-label-caps transition-colors hover:text-on-surface",
                      col.numeric && "flex-row-reverse",
                      active ? "text-on-surface" : "text-on-surface-variant",
                    )}
                  >
                    <span>{col.header}</span>
                    {active && desc && <ArrowDown size={12} aria-hidden />}
                    {active && !desc && <ArrowUp size={12} aria-hidden />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((run) => (
            <tr
              key={run.runId}
              id={`run-${run.runId}`}
              className="scroll-mt-24 border-t border-outline-variant first:border-t-0 hover:bg-surface-container-low/40 target:bg-primary/10"
            >
              <td className="px-3 py-2.5 type-num tnum font-medium text-on-surface">{run.runId}</td>
              <td className="px-3 py-2.5 type-num text-on-surface-variant">{dateLabel(run.validatedAt)}</td>
              <td className="px-3 py-2.5 type-num text-on-surface">{run.field ?? "-"}</td>
              <td className="px-3 py-2.5 type-num text-on-surface">{run.variety || "-"}</td>
              <td className="px-3 py-2.5 text-right type-num tnum text-on-surface-variant">{binsLabel(run.totalBins)}</td>
              <td className="px-3 py-2.5 text-right type-num tnum text-on-surface-variant">{weightLabel(run.loadWeight)}</td>
              <td className="px-3 py-2.5 text-right type-num tnum text-on-surface-variant">{weightLabel(run.binWeight)}</td>
              <td className="px-3 py-2.5 text-right type-num tnum font-medium text-on-surface">{turnoutLabel(run.turnout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
