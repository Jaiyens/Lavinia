"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";
import { en, lbs } from "@/copy/en";
import type { ReconciliationRow } from "@/lib/crops/views";

// The POUND-GATE table (WS2b): per (crop year, variety), the grower's field weight beside the
// packer's settled weight and the gap between them. A gap in the ~10 percent band is normal almond
// shrink; flagged rows carry the alert badge so the operator can eyeball them. Every figure is
// precomputed by reconciliationRows() — this component only FORMATS (it never computes a pound or a
// percent). Sortable on every column; built on @tanstack/react-table (headless), same idiom as the
// by-packer table (GapCell tone: positive = money-positive green, negative = alert).

const t = en.crops.reconcile.table;

const NUMERIC = new Set(["fieldPounds", "settledPounds", "gapPounds", "gapPct", "cropYear"]);

function GapPoundsCell({ row }: { row: ReconciliationRow }) {
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

function GapPctCell({ row }: { row: ReconciliationRow }) {
  if (row.gapPct === null) {
    return <span className="type-caption text-on-surface-variant/70">{t.gapNone}</span>;
  }
  const positive = row.gapPct > 0;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className={cn("type-num tnum", positive ? "text-money-positive" : "text-alert")}>
        {t.gapPctValue(row.gapPct)}
      </span>
      {row.flagged && <Badge variant="destructive">{t.flag}</Badge>}
    </span>
  );
}

export function CropReconciliationTable({ rows }: { rows: ReconciliationRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "cropYear", desc: true }]);

  const columns = useMemo<ColumnDef<ReconciliationRow>[]>(
    () => [
      {
        accessorKey: "cropYear",
        header: t.columns.year,
        cell: ({ row }) => <span className="type-num tnum text-on-surface">{row.original.cropYear}</span>,
      },
      {
        accessorKey: "variety",
        header: t.columns.variety,
        cell: ({ row }) => (
          <span className="type-num font-medium text-on-surface">{row.original.variety}</span>
        ),
      },
      {
        accessorKey: "fieldPounds",
        header: t.columns.field,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">{lbs(row.original.fieldPounds)}</span>
        ),
      },
      {
        id: "settledPounds",
        accessorFn: (r) => r.settledPounds ?? Number.NEGATIVE_INFINITY,
        header: t.columns.settled,
        cell: ({ row }) =>
          row.original.settledPounds === null ? (
            <span className="type-caption text-on-surface-variant/70">{t.settledNone}</span>
          ) : (
            <span className="type-num tnum text-on-surface">{lbs(row.original.settledPounds)}</span>
          ),
      },
      {
        id: "gapPounds",
        accessorFn: (r) => r.gapPounds ?? Number.NEGATIVE_INFINITY,
        header: t.columns.gap,
        cell: ({ row }) => <GapPoundsCell row={row.original} />,
      },
      {
        id: "gapPct",
        accessorFn: (r) => r.gapPct ?? Number.NEGATIVE_INFINITY,
        header: t.columns.gapPct,
        cell: ({ row }) => <GapPctCell row={row.original} />,
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
  const tableRows = table.getRowModel().rows;

  return (
    <section aria-label={t.caption}>
      <p className="mb-3 type-caption text-on-surface-variant">{t.rowCount(rows.length)}</p>
      <div className="overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1">
        <table className="w-full border-collapse">
          <thead className="bg-surface-container-lowest">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const isNumeric = NUMERIC.has(header.column.id);
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
            {tableRows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-outline-variant first:border-t-0"
              >
                {row.getVisibleCells().map((cell) => {
                  const isNumeric = NUMERIC.has(cell.column.id);
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
          </tbody>
        </table>
      </div>
    </section>
  );
}
