"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
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
import { metersCsv } from "@/lib/dashboard/csv";
import { SURFACE } from "@/lib/dashboard/surface";
import { CoveragePill, coverageLabel } from "./coverage-pill";
import { isActiveFilterValue } from "./filter-bar";

// The Table lens (Story 2.4): the dense, sortable Excel-style view the grower trusts. One row per
// meter; every figure gated on coverage (a withheld cell reads its state, never a fabricated $0).
// Reads ONLY the canonical MeterView[] + the nuqs entity/ranch/rate filter keys; a row click sets
// the `meter` key (the open-drawer seam the 2.5 drawer reads). Sort is ephemeral local state, not
// a URL key (the canonical nuqs keys are fixed at lens|entity|ranch|rate|meter). Desktop renders a
// dense table; mobile degrades to a simplified sortable card list.

const t = en.shell.table;

const COLUMNS = [
  { key: "name", align: "left" },
  { key: "ranch", align: "left" },
  { key: "entity", align: "left" },
  { key: "rate", align: "left" },
  { key: "legacy", align: "left" },
  { key: "cost", align: "right" },
  { key: "demand", align: "right" },
  { key: "status", align: "left" },
  { key: "coverage", align: "left" },
] as const satisfies readonly { key: SortKey; align: "left" | "right" }[];

// New numeric columns open biggest-first (where the money is); the rest open A-Z.
function defaultDir(key: SortKey): SortDir {
  return key === "cost" || key === "demand" ? "desc" : "asc";
}

function EmptyCell() {
  return <span className="text-on-surface-variant/70">{t.emptyShort}</span>;
}

function TextCell({ value }: { value: string | null }) {
  if (value === null || value === "") return <EmptyCell />;
  return <span className="text-on-surface">{value}</span>;
}

function LegacyCell({ isLegacy }: { isLegacy: boolean }) {
  if (!isLegacy) return <EmptyCell />;
  return (
    <span className="type-label-caps inline-flex items-center rounded-[var(--radius-control)] bg-surface-container-high px-2 py-0.5 text-on-surface-variant">
      {t.legacyFlag}
    </span>
  );
}

function StatusCell({ status, flagged }: { status: string | null; flagged: boolean }) {
  if (status === null) return <EmptyCell />;
  return (
    <span
      className={cn(
        "type-label-caps inline-flex items-center rounded-[var(--radius-control)] px-2 py-0.5",
        // A flagged-BAD pump is the one inventory concern signal today: clay + the verbatim
        // status word (color never the only signal). All others read calm.
        flagged ? "bg-alert-container text-on-alert-container" : "text-on-surface-variant",
      )}
    >
      {status}
    </span>
  );
}

// Cost / demand: a real dollar figure ONLY for a reconciled meter. An unreconciled meter reads
// its coverage state (withheld, muted), never a fabricated $0 (AR-15). A reconciled meter with no
// demand charge this cycle reads a neutral "None" (honest absence, distinct from withheld).
function MoneyCell({ row, kind }: { row: MeterRow; kind: "cost" | "demand" }) {
  if (row.coverageState !== "reconciled") {
    return (
      <span className="type-num text-on-surface-variant/70">{coverageLabel(row.coverageState)}</span>
    );
  }
  const cents = kind === "cost" ? row.costCents : row.demandCents;
  if (cents === null) {
    // demand: a reconciled meter genuinely carrying no demand charge. cost: the impossible
    // reconciled-without-total case (a 1.7 invariant) renders the no-value dash, never $0.
    return (
      <span className="type-num text-on-surface-variant">
        {kind === "demand" ? t.none : t.emptyShort}
      </span>
    );
  }
  return <span className="type-num tnum text-on-surface">{formatUsd(cents)}</span>;
}

function renderCell(key: SortKey, row: MeterRow): ReactNode {
  switch (key) {
    case "ranch":
      return <TextCell value={row.ranch} />;
    case "entity":
      return <TextCell value={row.entity} />;
    case "rate":
      return <TextCell value={row.rate} />;
    case "legacy":
      return <LegacyCell isLegacy={row.isLegacy} />;
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
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  const rows = useMemo(() => {
    const filtered = filterMeters(meters, { entity, ranch, rate });
    return sortRows(filtered.map(toMeterRow), sort.key, sort.dir);
  }, [meters, entity, ranch, rate, sort.key, sort.dir]);

  // Open the shared drawer (Story 2.5 reads this `meter` key). The desktop row is a
  // mouse-convenience target; the focusable name button is the keyboard / assistive-tech path.
  const open = (id: string) => void setMeter(id);
  const onHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }));

  if (rows.length === 0) {
    // Distinguish a farm with no meters at all (honest empty inventory) from a filter that
    // excluded everyone ("No meters match" + the clear-filter affordance, Story 2.6).
    const filteredOut = meters.length > 0;
    const hasActiveFilter =
      isActiveFilterValue(entity) || isActiveFilterValue(ranch) || isActiveFilterValue(rate);
    const clearAll = () => {
      void setEntity(null);
      void setRanch(null);
      void setRate(null);
    };
    return (
      <div
        id="energy-lens"
        className="flex min-h-[16rem] scroll-mt-6 flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8"
      >
        <p className="type-body-md text-on-surface-variant">
          {filteredOut ? t.noMatch : t.emptyFarm}
        </p>
        {filteredOut && hasActiveFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="press min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {en.shell.filter.clear}
          </button>
        )}
      </div>
    );
  }

  // One-click export of exactly what the table shows: same filtered rows, same sort order
  // (Story 2.7, FR-22). Built client-side; no nuqs key is written.
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
    // Deferred: a same-task revoke can abort the queued download in Safari/older Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section id="energy-lens" aria-label={t.caption} className="scroll-mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-caption text-on-surface-variant">{t.rowCount(rows.length)}</p>
        <button
          type="button"
          onClick={exportCsv}
          aria-label={t.exportAria}
          className="press min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
        >
          {t.export}
        </button>
      </div>

      {/* Mobile: a simplified sortable card list (no clickable headers, so a sort control). */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="meter-sort" className="type-label-caps text-on-surface-variant">
            {t.sortLabel}
          </label>
          <select
            id="meter-sort"
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSort({ key, dir: defaultDir(key) });
            }}
            className="min-h-[44px] flex-1 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-3 type-body-md text-on-surface"
          >
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {t.columns[c.key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
            aria-label={t.toggleDirection}
            className="press flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            {sort.dir === "asc" ? <ArrowUp size={18} aria-hidden /> : <ArrowDown size={18} aria-hidden />}
          </button>
        </div>
        <ul className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1">
          {rows.map((row) => (
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
                    {row.rate ? row.rate : t.emptyShort}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {/* Reconciled: the figure + the calm "Loaded" pill. Unreconciled: the pill alone
                      carries the coverage state, so its label is not stacked-duplicated. */}
                  {row.coverageState === "reconciled" && <MoneyCell row={row} kind="cost" />}
                  <CoveragePill state={row.coverageState} />
                  {/* The one health concern signal on the calm card (Story 3.6): a flagged-BAD
                      pump shows the same clay chip as the desktop status column; healthy
                      statuses stay on the desktop column and in the drawer, one tap away. */}
                  {row.isFlagged && <StatusCell status={row.status} flagged />}
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
                const active = sort.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
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
                        (sort.dir === "asc" ? (
                          <ArrowUp size={12} aria-hidden />
                        ) : (
                          <ArrowDown size={12} aria-hidden />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.meter.id}
                onClick={() => open(row.meter.id)}
                // The open meter (a focused finding traces here, AC4): tinted + aria-current,
                // so color is never the only signal.
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
                    className={cn(
                      "px-3 py-2.5 type-num",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {renderCell(col.key, row)}
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
