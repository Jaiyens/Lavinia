"use client";

import { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button } from "@/components/ui";
import { en, lbs } from "@/copy/en";
import type { PackerRow } from "@/lib/crops/views";
import { packerCsv } from "@/lib/crops/csv";

// The pounds-by-packer table (Phase 6): one row per (crop year, variety, buyer) commitment cell,
// built on @tanstack/react-table (headless) and virtualized with @tanstack/react-virtual so a large
// fleet view stays smooth. Every figure is precomputed by packerRows() — this component only
// formats. The SOURCE column tags each row's provenance (an Almond Logic estimate is never read as a
// packer-settled final), and the GAP column shows the settlement movement whenever one has landed.
// Sortable on every column; one-click CSV export of exactly what is shown, through the shared CSV
// mechanism.

const t = en.crops.table;

// The virtual list needs a fixed row height to position rows; this matches the desktop row padding.
const ROW_HEIGHT = 52;
// Below this many rows there is nothing to virtualize, so render them all (keeps the simple path).
const VIRTUALIZE_THRESHOLD = 30;

function SourceBadge({ source }: { source: PackerRow["source"] }) {
  // Settled = a packer statement is in (trust it); estimate = Almond Logic (clearly marked, muted)
  // so an estimate is never presented as a final.
  const settled = source === "PACKER_SETTLED";
  return (
    <Badge variant={settled ? "default" : "outline"} className="tnum">
      {settled ? t.sourceSettled : t.sourceEstimate}
    </Badge>
  );
}

function GapCell({ row }: { row: PackerRow }) {
  if (row.gapPounds === null) {
    return <span className="type-caption text-on-surface-variant/70">{t.gapNone}</span>;
  }
  const positive = row.gapPounds > 0;
  return (
    <span className={cn("type-num tnum", positive ? "text-money-positive" : "text-alert")}>
      {positive ? `+${lbs(row.gapPounds)}` : lbs(row.gapPounds)}
    </span>
  );
}

export function CropPackerTable({ rows }: { rows: PackerRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "cropYear", desc: true },
  ]);

  const columns = useMemo<ColumnDef<PackerRow>[]>(
    () => [
      {
        accessorKey: "buyer",
        header: t.columns.buyer,
        cell: ({ row }) => (
          <span className="type-num font-medium text-on-surface">{row.original.buyer}</span>
        ),
      },
      {
        accessorKey: "cropYear",
        header: t.columns.year,
        cell: ({ row }) => <span className="type-num tnum text-on-surface">{row.original.cropYear}</span>,
      },
      {
        accessorKey: "variety",
        header: t.columns.variety,
        cell: ({ row }) => <span className="type-num text-on-surface">{row.original.variety}</span>,
      },
      {
        accessorKey: "committedPounds",
        header: t.columns.pounds,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">{lbs(row.original.committedPounds)}</span>
        ),
      },
      {
        accessorKey: "source",
        header: t.columns.source,
        cell: ({ row }) => <SourceBadge source={row.original.source} />,
      },
      {
        // Sort the gap column on the raw pound movement; null (no settlement) sorts last.
        id: "gap",
        accessorFn: (r) => r.gapPounds ?? Number.NEGATIVE_INFINITY,
        header: t.columns.gap,
        cell: ({ row }) => <GapCell row={row.original} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = tableRows.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: virtualize,
  });

  const exportCsv = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const ordered = tableRows.map((r) => r.original);
    const blob = new Blob([packerCsv(ordered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terra-pounds-by-packer-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (rows.length === 0) {
    return (
      <section aria-label={t.caption}>
        <div className="flex min-h-[10rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8">
          <p className="type-body-md text-on-surface-variant">{t.empty}</p>
        </div>
      </section>
    );
  }

  const headerGroups = table.getHeaderGroups();
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualize && virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualize && virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;
  // The rows actually painted: the virtual window when virtualizing, else the whole set.
  const painted = virtualize
    ? virtualItems.map((vi) => tableRows[vi.index]).filter((r): r is (typeof tableRows)[number] => r !== undefined)
    : tableRows;

  return (
    <section aria-label={t.caption}>
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

      <div
        ref={scrollRef}
        className="max-h-[28rem] overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1"
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-container-lowest">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const isNumeric =
                    header.column.id === "committedPounds" ||
                    header.column.id === "gap" ||
                    header.column.id === "cropYear";
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                      }
                      className={cn(
                        "whitespace-nowrap border-b border-outline-variant px-3 py-2.5",
                        isNumeric ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={t.sortBy(String(header.column.columnDef.header))}
                        className={cn(
                          "inline-flex items-center gap-1 type-label-caps transition-colors hover:text-on-surface",
                          isNumeric && "flex-row-reverse",
                          sorted ? "text-on-surface" : "text-on-surface-variant",
                        )}
                      >
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {sorted === "asc" && <ArrowUp size={12} aria-hidden />}
                        {sorted === "desc" && <ArrowDown size={12} aria-hidden />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td colSpan={columns.length} style={{ height: paddingTop }} />
              </tr>
            )}
            {painted.map((row) => (
              <tr
                key={row.id}
                style={virtualize ? { height: ROW_HEIGHT } : undefined}
                className="border-t border-outline-variant first:border-t-0"
              >
                {row.getVisibleCells().map((cell) => {
                  const isNumeric =
                    cell.column.id === "committedPounds" ||
                    cell.column.id === "gap" ||
                    cell.column.id === "cropYear";
                  return (
                    <td
                      key={cell.id}
                      className={cn("px-3 py-2.5 type-num", isNumeric ? "text-right" : "text-left")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={columns.length} style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
