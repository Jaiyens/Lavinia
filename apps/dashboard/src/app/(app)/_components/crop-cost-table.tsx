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
import { Button } from "@/components/ui";
import { en, lbs, num, usdPerLb } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import type { BlockCostPerPound } from "@/lib/crops/cost";
import { costCsv } from "@/lib/crops/cost-csv";

// The cost-per-pound-by-block table (WS1): one row per block with allocated reconciled energy cost,
// mapped almond yield, and the cents/lb ratio. Built on @tanstack/react-table (headless) and clones
// the by-packer table's interaction model (sortable columns, one-click CSV through the shared
// mechanism). Every figure is precomputed by the pure cost engine (costPerPound) and handed in;
// this component only formats. A block with no mapped yield has no honest ratio and reads the
// "no yield mapped" label, never a fabricated number.

const t = en.crops.cost.table;

const NUMERIC_COLUMNS = new Set(["acreage", "energyCents", "netLb", "centsPerLb"]);

function CostCell({ row }: { row: BlockCostPerPound }) {
  if (row.centsPerLb === null) {
    return <span className="type-caption text-on-surface-variant/70">{t.noRatio}</span>;
  }
  return <span className="type-num tnum text-on-surface">{usdPerLb(row.centsPerLb)}</span>;
}

export function CropCostTable({ rows }: { rows: BlockCostPerPound[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "centsPerLb", desc: true }]);

  const columns = useMemo<ColumnDef<BlockCostPerPound>[]>(
    () => [
      {
        accessorKey: "blockName",
        header: t.columns.block,
        cell: ({ row }) => (
          <span className="type-num font-medium text-on-surface">{row.original.blockName}</span>
        ),
      },
      {
        // Acreage may be null (not on file); sort nulls last.
        id: "acreage",
        accessorFn: (r) => r.acreage ?? Number.NEGATIVE_INFINITY,
        header: t.columns.acreage,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">
            {row.original.acreage === null ? "-" : num(row.original.acreage)}
          </span>
        ),
      },
      {
        accessorKey: "energyCents",
        header: t.columns.energy,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">{formatUsdWhole(row.original.energyCents)}</span>
        ),
      },
      {
        accessorKey: "netLb",
        header: t.columns.yield,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">{lbs(row.original.netLb)}</span>
        ),
      },
      {
        // Sort the ratio column on the raw cents/lb; null (no yield) sorts last.
        id: "centsPerLb",
        accessorFn: (r) => r.centsPerLb ?? Number.NEGATIVE_INFINITY,
        header: t.columns.costPerLb,
        cell: ({ row }) => <CostCell row={row.original} />,
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

  const exportCsv = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const ordered = tableRows.map((r) => r.original);
    const blob = new Blob([costCsv(ordered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terra-cost-per-pound-${stamp}.csv`;
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

      <div className="overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-container-lowest">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const isNumeric = NUMERIC_COLUMNS.has(header.column.id);
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
                  const isNumeric = NUMERIC_COLUMNS.has(cell.column.id);
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
