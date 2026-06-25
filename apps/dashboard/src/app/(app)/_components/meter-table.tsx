"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowDown, ArrowUp, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Input } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { en, rateGloss } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import type { MeterView } from "@/lib/dashboard/load";
import {
  toMeterRow,
  filterMeters,
  sortRows,
  type MeterRow,
  type SortKey,
  type SortDir,
} from "@/lib/dashboard/table";
import { inferGroupFromName } from "@/lib/meters/group";
import { metersCsv } from "@/lib/dashboard/csv";
import { SURFACE } from "@/lib/dashboard/surface";
import { CoveragePill, coverageLabel } from "./coverage-pill";
import { isActiveFilterValue } from "./filter-bar";

// The Table lens (Story 2.4): the dense, sortable Excel-style view the grower trusts. One row per
// meter; every figure gated on coverage (a withheld cell reads its state, never a fabricated $0).
// Reads the canonical MeterView[] + the nuqs entity/ranch/rate filter keys; a row click sets the
// `meter` key (the drawer seam). The Meters tab was folded in here: a name SEARCH, an optional
// GROUP-BY (by ranch, name-inferred fallback), and a peak-kW column with an inline bar; the drawer
// shows the intra-day load curve. Sort/search/group are ephemeral local state, not URL keys.

const t = en.shell.table;

const COLUMNS = [
  { key: "name", align: "left" },
  { key: "ranch", align: "left" },
  { key: "entity", align: "left" },
  { key: "rate", align: "left" },
  { key: "peak", align: "left" },
  { key: "cost", align: "right" },
  { key: "demand", align: "right" },
  { key: "status", align: "left" },
  { key: "coverage", align: "left" },
] as const satisfies readonly { key: SortKey; align: "left" | "right" }[];

// Numeric columns open biggest-first (where the money / load is); the rest open A-Z.
function defaultDir(key: SortKey): SortDir {
  return key === "cost" || key === "demand" || key === "peak" ? "desc" : "asc";
}

// The farmer-facing "Sort by" choices, in priority order. Each maps to the table's sort key/direction
// (+ whether to group by meter group). "demand" is the default: the demand charge is the big lever.
const SORT_OPTIONS = [
  { id: "demand", key: "demand", dir: "desc", grouped: false },
  { id: "cost", key: "cost", dir: "desc", grouped: false },
  { id: "peak", key: "peak", dir: "desc", grouped: false },
  { id: "group", key: "demand", dir: "desc", grouped: true },
  { id: "status", key: "status", dir: "asc", grouped: false },
  { id: "name", key: "name", dir: "asc", grouped: false },
] as const satisfies readonly { id: string; key: SortKey; dir: SortDir; grouped: boolean }[];

/** The group a row belongs to: its ranch, else inferred from the meter name, else "Other meters". */
function groupKey(row: MeterRow): string {
  return row.ranch?.trim() || inferGroupFromName(row.name) || t.ungrouped;
}

function EmptyCell() {
  return <span className="text-on-surface-variant/70">{t.emptyShort}</span>;
}

function TextCell({ value }: { value: string | null }) {
  if (value === null || value === "") return <EmptyCell />;
  return <span className="text-on-surface">{value}</span>;
}

// Rate is a first-class fact (the whole rate-optimization thesis): the code in a green pill so the
// eye lands on it, with the plain-English gloss beneath so the grower never stares at a bare code.
function RateCell({ rate }: { rate: string | null }) {
  if (rate === null || rate === "") return <EmptyCell />;
  const gloss = rateGloss(rate);
  return (
    <span className="inline-flex flex-col">
      <span className="type-label-caps inline-flex w-fit items-center rounded-[var(--radius-control)] bg-primary-container px-2 py-0.5 font-semibold text-on-primary-container">
        {rate}
      </span>
      {gloss && <span className="mt-0.5 type-caption text-on-surface-variant">{gloss}</span>}
    </span>
  );
}

// Peak demand kW (replaces the old legacy flag): the number plus a thin bar scaled to the largest
// peak among the shown meters, so relative demand size reads at a glance.
function PeakCell({ kw, max }: { kw: number | null; max: number }) {
  if (kw === null) return <EmptyCell />;
  const pct = max > 0 ? Math.max(4, Math.round((kw / max) * 100)) : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="type-num tnum w-14 shrink-0 text-on-surface">
        {Math.round(kw)} {t.peakUnit}
      </span>
      <span
        aria-hidden
        className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-container-high sm:inline-block"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

function StatusCell({ status, flagged }: { status: string | null; flagged: boolean }) {
  if (status === null) return <EmptyCell />;
  return (
    <span
      className={cn(
        "type-label-caps inline-flex items-center rounded-[var(--radius-control)] px-2 py-0.5",
        flagged ? "bg-alert-container text-on-alert-container" : "text-on-surface-variant",
      )}
    >
      {status}
    </span>
  );
}

// Cost / demand: a real dollar figure ONLY for a reconciled meter (AR-15); an unreconciled meter
// reads its coverage state, never a fabricated $0. A reconciled meter with no demand charge reads
// a neutral "None".
function MoneyCell({ row, kind }: { row: MeterRow; kind: "cost" | "demand" }) {
  // Cost column, solar/NEM meter: never a monthly figure. With a printed true-up on file,
  // show that ANNUAL amount (suffixed "true-up"); otherwise the honest not-yet-settled state.
  // The demand column is unaffected - solar's printed demand is genuinely owed and renders
  // through the normal path below.
  if (kind === "cost" && (row.costSource === "NEM_TRUEUP" || row.costSource === "NEM_UNSETTLED")) {
    if (row.costSource === "NEM_TRUEUP" && row.trueUpAmountCents !== null) {
      return (
        <span className="type-num tnum text-on-surface" aria-label={t.trueUpAria}>
          {formatUsd(row.trueUpAmountCents)}{" "}
          <span className="type-label-caps text-on-surface-variant/70">{t.trueUpSuffix}</span>
        </span>
      );
    }
    return <span className="type-num text-on-surface-variant/70">{t.notYetSettled}</span>;
  }
  if (row.coverageState !== "reconciled") {
    // Cost column only: a MODELED meter (real interval usage, no printed bill) shows a clearly
    // marked estimate ("~$X est."), muted and never presented as billed. Everything else - and
    // the demand column, which has no modeled basis - reads its coverage state (AR-15).
    if (kind === "cost" && row.costSource === "MODELED" && row.modeledCents !== null) {
      return (
        <span className="type-num tnum text-on-surface-variant" aria-label={t.estimateAria}>
          ~{formatUsd(row.modeledCents)}{" "}
          <span className="type-label-caps text-on-surface-variant/70">{t.estimateSuffix}</span>
        </span>
      );
    }
    return (
      <span className="type-num text-on-surface-variant/70">{coverageLabel(row.coverageState)}</span>
    );
  }
  const cents = kind === "cost" ? row.costCents : row.demandCents;
  if (cents === null) {
    return (
      <span className="type-num text-on-surface-variant">
        {kind === "demand" ? t.none : t.emptyShort}
      </span>
    );
  }
  return <span className="type-num tnum text-on-surface">{formatUsd(cents)}</span>;
}

function renderCell(key: SortKey, row: MeterRow, maxPeak: number): ReactNode {
  switch (key) {
    case "ranch":
      return <TextCell value={row.ranch} />;
    case "entity":
      return <TextCell value={row.entity} />;
    case "rate":
      return <RateCell rate={row.rate} />;
    case "peak":
      return <PeakCell kw={row.peakKw} max={maxPeak} />;
    case "cost":
      return <MoneyCell row={row} kind="cost" />;
    case "demand":
      return <MoneyCell row={row} kind="demand" />;
    case "status":
      return <StatusCell status={row.status} flagged={row.isFlagged} />;
    case "coverage":
      return <CoveragePill state={row.coverageState} />;
    case "name":
      return null; // rendered explicitly as the open-drawer button
  }
}

export function MeterTable({ meters }: { meters: MeterView[] }) {
  const [entity, setEntity] = useQueryState(SURFACE.entity);
  const [ranch, setRanch] = useQueryState(SURFACE.ranch);
  const [rate, setRate] = useQueryState(SURFACE.rate);
  const [meterId, setMeter] = useQueryState(SURFACE.meter);
  // Default: demand charge, highest first - the demand charge is the big PG&E lever for a farmer.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "demand", dir: "desc" });
  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = filterMeters(meters, { entity, ranch, rate }).filter(
      (m) => q === "" || m.name.toLowerCase().includes(q),
    );
    return sortRows(filtered.map(toMeterRow), sort.key, sort.dir);
  }, [meters, entity, ranch, rate, query, sort.key, sort.dir]);

  const maxPeak = useMemo(
    () => rows.reduce((mx, r) => (r.peakKw != null ? Math.max(mx, r.peakKw) : mx), 0),
    [rows],
  );

  // When grouping is on, bucket the (already-sorted) rows by group and order groups A-Z; otherwise a
  // single unlabeled section so the render path is uniform.
  const sections = useMemo((): { group: string | null; rows: MeterRow[] }[] => {
    if (!grouped) return [{ group: null, rows }];
    const map = new Map<string, MeterRow[]>();
    for (const r of rows) {
      const g = groupKey(r);
      const arr = map.get(g);
      if (arr) arr.push(r);
      else map.set(g, [r]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }))
      .map(([group, groupRows]) => ({ group, rows: groupRows }));
  }, [grouped, rows]);

  const open = (id: string) => void setMeter(id);
  const onHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }));

  // The Sort-by dropdown reflects the current sort+group; a column-header click can produce an
  // off-list combo, which shows as "Custom".
  const currentSortId =
    SORT_OPTIONS.find((o) => o.key === sort.key && o.dir === sort.dir && o.grouped === grouped)?.id ?? "";
  const applySort = (id: string) => {
    const o = SORT_OPTIONS.find((x) => x.id === id);
    if (!o) return;
    setSort({ key: o.key, dir: o.dir });
    setGrouped(o.grouped);
  };

  // Search + group controls, shared by the empty state and the populated views.
  const controls = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-on-surface-variant"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className="min-h-[44px] pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setQuery("")}
            aria-label={t.searchClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant"
          >
            <X size={15} aria-hidden />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span id="meter-sortby-label" className="type-label-caps shrink-0 text-on-surface-variant">
          {t.sortByLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id="meter-sortby"
              variant="outline"
              size="lg"
              aria-labelledby="meter-sortby-label meter-sortby"
              className="min-h-[44px] justify-between gap-2 font-normal"
            >
              <span className="truncate">
                {currentSortId === "" ? t.sortByCustom : t.sortOptions[currentSortId]}
              </span>
              <ChevronDown className="opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={currentSortId} onValueChange={applySort}>
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.id} value={o.id}>
                  {t.sortOptions[o.id]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  if (rows.length === 0) {
    const hasActiveFilter =
      isActiveFilterValue(entity) || isActiveFilterValue(ranch) || isActiveFilterValue(rate) || query.trim() !== "";
    // No meters at all (honest empty inventory) vs a filter/search that excluded everyone.
    const filteredOut = meters.length > 0 && hasActiveFilter;
    const clearAll = () => {
      void setEntity(null);
      void setRanch(null);
      void setRate(null);
      setQuery("");
    };
    return (
      <section id="energy-lens" className="scroll-mt-6">
        {meters.length > 0 && controls}
        <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8">
          <p className="type-body-md text-on-surface-variant">{filteredOut ? t.noMatch : t.emptyFarm}</p>
          {filteredOut && (
            <Button type="button" variant="outline" size="lg" onClick={clearAll} className="min-h-[44px]">
              {en.shell.filter.clear}
            </Button>
          )}
        </div>
      </section>
    );
  }

  // One-click export of exactly what the table shows: same filtered rows, same sort order.
  const exportCsv = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const blob = new Blob([metersCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terra-meters-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section id="energy-lens" aria-label={t.caption} className="scroll-mt-6">
      {controls}
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-caption text-on-surface-variant">{t.rowCount(rows.length)}</p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={exportCsv}
          aria-label={t.exportAria}
          className="min-h-[44px]"
        >
          {t.export}
        </Button>
      </div>

      {/* Mobile: a simplified card list. Ordering comes from the shared "Sort by" control above. */}
      <div className="md:hidden">
        <ul className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1">
          {sections.map((section) => (
            <li key={section.group ?? "__all"}>
              {section.group !== null && (
                <p className="border-t border-outline-variant bg-surface-container-low px-4 py-1.5 type-label-caps text-on-surface-variant first:border-t-0">
                  {section.group} &middot; {t.groupCount(section.rows.length)}
                </p>
              )}
              <ul>
                {section.rows.map((row) => (
                  <li key={row.meter.id} className="border-t border-outline-variant first:border-t-0">
                    <button
                      type="button"
                      onClick={() => open(row.meter.id)}
                      aria-label={
                        row.isFlagged && row.status !== null
                          ? t.openMeterFlagged(row.name, row.status)
                          : t.openMeter(row.name)
                      }
                      aria-current={row.meter.id === meterId ? "true" : undefined}
                      className={cn(
                        "flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color,box-shadow] duration-[180ms] hover:bg-surface-container-low hover:[box-shadow:inset_3px_0_0_0_var(--primary)]",
                        row.meter.id === meterId && "bg-surface-container-high [box-shadow:inset_3px_0_0_0_var(--primary)]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate type-num font-medium text-on-surface">{row.name}</span>
                        <span className="block truncate type-caption text-on-surface-variant">
                          {row.peakKw !== null ? `${Math.round(row.peakKw)} ${t.peakUnit}` : (row.rate ?? t.emptyShort)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {row.coverageState === "reconciled" && <MoneyCell row={row} kind="cost" />}
                        <CoveragePill state={row.coverageState} />
                        {row.isFlagged && <StatusCell status={row.status} flagged />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
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
                const active = sort.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("whitespace-nowrap px-3 py-2.5", col.align === "right" ? "text-right" : "text-left")}
                  >
                    <button
                      type="button"
                      onClick={() => onHeader(col.key)}
                      aria-label={t.sortBy(t.columns[col.key])}
                      className={cn(
                        "inline-flex items-center gap-1 type-label-caps transition-colors hover:text-on-surface",
                        col.align === "right" && "flex-row-reverse",
                        active ? "text-on-surface" : "text-on-surface-variant",
                      )}
                    >
                      <span>{t.columns[col.key]}</span>
                      {active &&
                        (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.group ?? "__all"}>
                {section.group !== null && (
                  <tr className="bg-surface-container-low">
                    <td colSpan={COLUMNS.length} className="px-3 py-1.5 type-label-caps text-on-surface-variant">
                      {section.group} &middot; {t.groupCount(section.rows.length)}
                    </td>
                  </tr>
                )}
                {section.rows.map((row) => (
                  <tr
                    key={row.meter.id}
                    onClick={() => open(row.meter.id)}
                    aria-current={row.meter.id === meterId ? "true" : undefined}
                    className={cn(
                      "cursor-pointer border-t border-outline-variant transition-[background-color,box-shadow] duration-[180ms] hover:bg-surface-container-low hover:[box-shadow:inset_3px_0_0_0_var(--primary)]",
                      row.meter.id === meterId && "bg-surface-container-high [box-shadow:inset_3px_0_0_0_var(--primary)]",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(row.meter.id);
                        }}
                        aria-label={t.openMeter(row.name)}
                        className="type-num font-medium text-on-surface transition-colors hover:text-primary"
                      >
                        {row.name}
                      </button>
                    </td>
                    {COLUMNS.slice(1).map((col) => (
                      <td
                        key={col.key}
                        className={cn("px-3 py-2.5 type-num", col.align === "right" ? "text-right" : "text-left")}
                      >
                        {renderCell(col.key, row, maxPeak)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
