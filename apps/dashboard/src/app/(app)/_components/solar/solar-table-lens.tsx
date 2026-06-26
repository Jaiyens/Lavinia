"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MeterView } from "@/lib/dashboard/load";
import { solarMetersCsv } from "@/lib/dashboard/csv";
import { SURFACE } from "@/lib/dashboard/surface";
import { CoveragePill } from "../coverage-pill";

// The Table lens (A-8, UX-DR7, FR36): the Excel bridge. Meters down, solar columns across, filterable
// (via the shared filter bar / nuqs keys the SolarSurface owns) and sortable, with a one-click CSV
// export so the farm-office controller can stop maintaining the parallel array-to-meter spreadsheet by
// hand. It reuses the meter-table grammar (a dense sortable desktop table, a simplified mobile card
// list), not a fork of it: the solar columns and the solar CSV are its only divergence.
//
// HONEST-BLANK discipline (FR10, the one law): the allocation % column and the credit dollar are
// honest-blank until Epic C/G fill them, rendered (and exported) as the not-on-file marker, never a
// fabricated zero, never a percent multiplied into a dollar. The program-code cell reads the generic
// NEM2 program for a `nem2*` token and not-on-file otherwise (FR2/FR5), never a guessed granular code.
//
// It is handed the already-filter-narrowed MeterView[] (the SolarSurface narrows once via filterMeters
// so the table, the KPI strip, and every lens stay consistent); it filters to the solar meters itself
// and never reads the 15-minute interval series. A row tap sets the `meter` nuqs key, opening the
// shared drawer to that meter's solar section, the same open seam the Arrays and Map lenses use.

const t = en.solar.table;

type SolarSortKey = "name" | "program" | "nameplate" | "array" | "trueUp" | "coverage";

type SortDir = "asc" | "desc";

const COLUMNS = [
  { key: "name", align: "left" },
  { key: "program", align: "left" },
  { key: "nameplate", align: "right" },
  { key: "array", align: "left" },
  { key: "allocation", align: "left" },
  { key: "trueUp", align: "left" },
  { key: "coverage", align: "left" },
] as const satisfies readonly { key: keyof typeof t.columns; align: "left" | "right" }[];

// The allocation column is honest-blank for now, so it is display-only (never a sort key); the rest
// sort. defaultDir opens nameplate biggest-first (where the capacity is), the rest A-Z.
const SORTABLE: readonly SolarSortKey[] = ["name", "program", "nameplate", "array", "trueUp", "coverage"];

function isSortable(key: keyof typeof t.columns): key is SolarSortKey {
  return (SORTABLE as readonly string[]).includes(key);
}

function defaultDir(key: SolarSortKey): SortDir {
  return key === "nameplate" ? "desc" : "asc";
}

/** Program-code cell text: the generic NEM2 program for a `nem2*` token, not-on-file otherwise
 *  (FR2/FR5), never a guessed granular code. Mirrors the csv.ts solarProgramCell rule. */
function programText(nemType: string | null): string {
  if (nemType !== null && nemType.toLowerCase().startsWith("nem2")) return t.programGeneric;
  return t.programNotOnFile;
}

/** Array-membership cell text: the arrays this meter sits under, joined; none reads not-on-file. */
function arrayText(m: MeterView): string {
  const names = m.benefitingArrays
    .map((a) => a.name)
    .filter((n): n is string => n !== null && n.trim() !== "");
  return names.length > 0 ? names.join(t.arrayJoin) : t.arrayNone;
}

function strCmp(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

const COVERAGE_ORDER = { reconciled: 0, needs_review: 1, no_bill: 2 } as const;

function compare(a: MeterView, b: MeterView, key: SolarSortKey, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "name":
      return sign * strCmp(a.name, b.name);
    case "program":
      return sign * strCmp(programText(a.nemType), programText(b.nemType));
    case "array":
      return sign * strCmp(arrayText(a), arrayText(b));
    case "coverage":
      return sign * (COVERAGE_ORDER[a.coverageState] - COVERAGE_ORDER[b.coverageState]);
    case "nameplate": {
      // Nulls last regardless of direction, so a real capacity is never hidden under a blank.
      if (a.solarKw === null && b.solarKw === null) return strCmp(a.name, b.name);
      if (a.solarKw === null) return 1;
      if (b.solarKw === null) return -1;
      return sign * (a.solarKw - b.solarKw);
    }
    case "trueUp": {
      if (a.trueUpMonth === null && b.trueUpMonth === null) return strCmp(a.name, b.name);
      if (a.trueUpMonth === null) return 1;
      if (b.trueUpMonth === null) return -1;
      return sign * (a.trueUpMonth - b.trueUpMonth);
    }
  }
}

function ProgramCell({ nemType }: { nemType: string | null }) {
  const generic = nemType !== null && nemType.toLowerCase().startsWith("nem2");
  return (
    <span
      className={cn(
        "type-label-caps inline-flex items-center rounded-[var(--radius-control)] px-2 py-0.5",
        generic ? "bg-surface-container-high text-on-surface-variant" : "text-on-surface-variant",
      )}
    >
      {generic ? t.programGeneric : t.programNotOnFile}
    </span>
  );
}

function NotOnFile({ value }: { value: string }) {
  return <span className="text-on-surface-variant/70">{value}</span>;
}

function renderCell(key: keyof typeof t.columns, m: MeterView): ReactNode {
  switch (key) {
    case "name":
      return null; // rendered explicitly as the open-drawer button
    case "program":
      return <ProgramCell nemType={m.nemType} />;
    case "nameplate":
      return m.solarKw !== null ? (
        <span className="tnum text-on-surface">{t.nameplate(m.solarKw)}</span>
      ) : (
        <NotOnFile value={t.nameplateNotOnFile} />
      );
    case "array": {
      const text = arrayText(m);
      return text === t.arrayNone ? <NotOnFile value={text} /> : <span className="text-on-surface">{text}</span>;
    }
    case "allocation":
      // Honest-blank until Epic C computes the usage-proportional share (FR10): the not-on-file marker,
      // never a fabricated %, never a percent-times-dollar credit.
      return <NotOnFile value={t.allocationNotOnFile} />;
    case "trueUp":
      return m.trueUpMonth !== null ? (
        <span className="text-on-surface">{t.trueUpMonth(m.trueUpMonth)}</span>
      ) : (
        <NotOnFile value={t.trueUpNone} />
      );
    case "coverage":
      return <CoveragePill state={m.coverageState} />;
  }
}

export function SolarTableLens({ meters }: { meters: MeterView[] }) {
  const [meterId, setMeter] = useQueryState(SURFACE.meter);
  const [sort, setSort] = useState<{ key: SolarSortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  const rows = useMemo(() => {
    const solar = meters.filter((m) => m.isSolar);
    return [...solar].sort((a, b) => {
      const primary = compare(a, b, sort.key, sort.dir);
      if (primary !== 0 || sort.key === "name") return primary;
      return strCmp(a.name, b.name);
    });
  }, [meters, sort.key, sort.dir]);

  const open = (id: string) => void setMeter(id);
  const onHeader = (key: SolarSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }));

  if (rows.length === 0) {
    // A farm with no solar at all vs a filter that excluded everyone (meters narrowed upstream).
    const filteredOut = meters.length > 0;
    return (
      <section
        id="solar-lens"
        aria-label={t.caption}
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center"
      >
        <p className="type-body-md text-on-surface-variant">{filteredOut ? t.noMatch : t.empty}</p>
      </section>
    );
  }

  // One-click export of exactly what the table shows: same rows, same sort order (FR36). Built
  // client-side; no nuqs key is written. solarMetersCsv carries the honest-blank not-on-file marker.
  const exportCsv = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const blob = new Blob([solarMetersCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terra-solar-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Deferred: a same-task revoke can abort the queued download in Safari/older Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section id="solar-lens" aria-label={t.caption} className="scroll-mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-caption text-on-surface-variant">{t.rowCount(rows.length)}</p>
        <Button
          type="button"
          variant="outline"
          onClick={exportCsv}
          aria-label={t.exportAria}
          className="min-h-[44px] px-4 type-body-md text-on-surface"
        >
          {t.export}
        </Button>
      </div>

      {/* Mobile: a simplified sortable card list (no clickable headers, so a sort control). */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <span id="solar-sort-label" className="type-label-caps text-on-surface-variant">
            {t.sortLabel}
          </span>
          <Select
            value={sort.key}
            onValueChange={(value) => {
              const key = value as SolarSortKey;
              setSort({ key, dir: defaultDir(key) });
            }}
          >
            <SelectTrigger
              aria-labelledby="solar-sort-label"
              className="min-h-[44px] flex-1 bg-surface-container-lowest type-body-md text-on-surface"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTABLE.map((key) => (
                <SelectItem key={key} value={key}>
                  {t.columns[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
            aria-label={t.toggleDirection}
            className="size-11 text-on-surface-variant"
          >
            {sort.dir === "asc" ? <ArrowUp size={18} aria-hidden /> : <ArrowDown size={18} aria-hidden />}
          </Button>
        </div>
        <ul className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1">
          {rows.map((m) => (
            <li key={m.id} className="border-t border-outline-variant first:border-t-0">
              <button
                type="button"
                onClick={() => open(m.id)}
                aria-label={t.openMeter(m.name)}
                aria-current={m.id === meterId ? "true" : undefined}
                className={cn(
                  "flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color,box-shadow] duration-[180ms] hover:bg-surface-container-low hover:[box-shadow:inset_3px_0_0_0_var(--primary)]",
                  m.id === meterId && "bg-surface-container-high [box-shadow:inset_3px_0_0_0_var(--primary)]",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate type-num font-medium text-on-surface">{m.name}</span>
                  <span className="block truncate type-caption text-on-surface-variant">{arrayText(m)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <ProgramCell nemType={m.nemType} />
                  <CoveragePill state={m.coverageState} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Desktop: the dense, sortable table. */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1 md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                // A narrowed key (SolarSortKey | null) so the sort handler only ever sees a sortable
                // key; the honest-blank allocation column is display-only (not a sort key).
                const sortKey = isSortable(col.key) ? col.key : null;
                const active = sortKey !== null && sort.key === sortKey;
                const label = t.columns[col.key];
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("whitespace-nowrap px-3 py-2.5", col.align === "right" ? "text-right" : "text-left")}
                  >
                    {sortKey !== null ? (
                      <button
                        type="button"
                        onClick={() => onHeader(sortKey)}
                        aria-label={t.sortBy(label)}
                        className={cn(
                          "inline-flex items-center gap-1 type-label-caps transition-colors hover:text-on-surface",
                          col.align === "right" && "flex-row-reverse",
                          active ? "text-on-surface" : "text-on-surface-variant",
                        )}
                      >
                        <span>{label}</span>
                        {active &&
                          (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                      </button>
                    ) : (
                      <span className="type-label-caps text-on-surface-variant">{label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.id}
                onClick={() => open(m.id)}
                aria-current={m.id === meterId ? "true" : undefined}
                className={cn(
                  "cursor-pointer border-t border-outline-variant transition-[background-color,box-shadow] duration-[180ms] hover:bg-surface-container-low hover:[box-shadow:inset_3px_0_0_0_var(--primary)]",
                  m.id === meterId && "bg-surface-container-high [box-shadow:inset_3px_0_0_0_var(--primary)]",
                )}
              >
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(m.id);
                    }}
                    aria-label={t.openMeter(m.name)}
                    className="type-num font-medium text-on-surface transition-colors hover:text-primary"
                  >
                    {m.name}
                  </button>
                </td>
                {COLUMNS.slice(1).map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-3 py-2.5 type-num", col.align === "right" ? "text-right" : "text-left")}
                  >
                    {renderCell(col.key, m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
