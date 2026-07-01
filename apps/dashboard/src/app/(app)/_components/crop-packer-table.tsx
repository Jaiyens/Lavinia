"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button } from "@/components/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { en, lbs, usd, usdPerLb } from "@/copy/en";
import type { PackerRow, CommitmentLedgerRow } from "@/lib/crops/views";
import type { CommitmentStatus } from "@/lib/crops/types";
import { packerCsv } from "@/lib/crops/csv";
import { recordCollectionAction } from "@/lib/crops/ledger-actions";

// The pounds-by-packer table (Phase 6) extended with the commitment LEDGER lifecycle (WS2b). Two
// modes from one component:
//  - default (rows): one row per (crop year, variety, buyer) commitment cell, the pounds + source +
//    gap columns, sortable, with CSV export. This is the existing Crops-tab view, unchanged.
//  - ledger (ledger prop): one row per LIVE commitment, the same buyer/year/variety/pounds plus the
//    cash lifecycle columns ($/lb, Status, Expected, Collected, Outstanding) and a manager-gated
//    "Record collection" action wired to recordCollectionAction.
// Built on @tanstack/react-table (headless), virtualized with @tanstack/react-virtual so a large
// fleet view stays smooth. Every figure is precomputed in the lib (packerRows / commitmentLedgerRows
// + collection.ts) — this component only FORMATS, never computes a pound or a cent.

const t = en.crops.table;
const lt = en.crops.ledger;

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

const STATUS_LABEL: Record<CommitmentStatus, string> = {
  committed: lt.statusCommitted,
  settled: lt.statusSettled,
  collected: lt.statusCollected,
};

function StatusBadge({ status }: { status: CommitmentStatus }) {
  // Collected (cash in hand) reads as the strong default; the earlier stages read as outline.
  const collected = status === "collected";
  return (
    <Badge variant={collected ? "default" : "outline"} className="tnum">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Whole-dollar money from integer cents; null cents (no price) reads the honest "Price TBD". */
function usdCentsOrNone(cents: number | null): string {
  if (cents === null) return lt.cashNone;
  return usd(cents / 100);
}

// --- The inline "Record collection" cell ---------------------------------------------------------
// Manager+ only (the parent passes readOnly). Opens a small dollars input, converts to integer cents
// (the money law: integer cents, never a float dollar over the wire), and calls the append-only
// server action. On success the revalidated shell re-renders the row at the collected stage.

function CollectCell({ row, readOnly }: { row: CommitmentLedgerRow; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (row.status === "collected") {
    return <span className="type-caption text-on-surface-variant/70">{lt.collected}</span>;
  }
  if (readOnly) {
    return <span className="type-caption text-on-surface-variant/70">-</span>;
  }

  const save = () => {
    setFailed(false);
    // Parse dollars -> integer cents. Reject anything that is not a non-negative finite number.
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setFailed(true);
      return;
    }
    const cents = Math.round(dollars * 100);
    startTransition(async () => {
      try {
        const result = await recordCollectionAction(row.key, cents);
        if (result.ok) {
          setOpen(false);
          setAmount("");
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      }
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={lt.collectAria(row.buyer, row.cropYear, row.variety)}
        className="min-h-[40px]"
      >
        {lt.collect}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={lt.collectAmountLabel}
          className="w-28 text-right tnum"
          disabled={isPending}
        />
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={save}
          disabled={isPending}
          className="min-h-[40px]"
        >
          {isPending ? lt.collectSaving : lt.collectSave}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setFailed(false);
          }}
          disabled={isPending}
          className="min-h-[40px]"
        >
          {lt.collectCancel}
        </Button>
      </div>
      {failed && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription>{lt.collectError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

const PACKER_NUMERIC = new Set(["committedPounds", "gap", "cropYear"]);
const LEDGER_NUMERIC = new Set([
  "committedPounds",
  "cropYear",
  "priceCentsPerPound",
  "expectedCents",
  "collectedCents",
  "outstandingCents",
]);

// === Default mode: pounds-by-packer ==============================================================

function PackerTableView({ rows }: { rows: PackerRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "cropYear", desc: true }]);

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
      <VirtualTable table={table} numericIds={PACKER_NUMERIC} virtualizeOn rowHeight={ROW_HEIGHT} />
    </section>
  );
}

// === Ledger mode: commitment lifecycle + cash ====================================================

function LedgerTableView({ rows, readOnly }: { rows: CommitmentLedgerRow[]; readOnly: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "cropYear", desc: true }]);

  const columns = useMemo<ColumnDef<CommitmentLedgerRow>[]>(
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
        id: "priceCentsPerPound",
        accessorFn: (r) => r.priceCentsPerPound ?? Number.NEGATIVE_INFINITY,
        header: lt.columns.price,
        cell: ({ row }) =>
          row.original.priceCentsPerPound === null ? (
            <span className="type-caption text-on-surface-variant/70">{lt.priceNone}</span>
          ) : (
            <span className="type-num tnum text-on-surface">
              {usdPerLb(row.original.priceCentsPerPound)}
            </span>
          ),
      },
      {
        accessorKey: "status",
        header: lt.columns.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "expectedCents",
        accessorFn: (r) => r.expectedCents ?? Number.NEGATIVE_INFINITY,
        header: lt.columns.expected,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">
            {usdCentsOrNone(row.original.expectedCents)}
          </span>
        ),
      },
      {
        accessorKey: "collectedCents",
        header: lt.columns.collected,
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface">{usd(row.original.collectedCents / 100)}</span>
        ),
      },
      {
        id: "outstandingCents",
        accessorFn: (r) => r.outstandingCents ?? Number.NEGATIVE_INFINITY,
        header: lt.columns.outstanding,
        cell: ({ row }) => {
          const out = row.original.outstandingCents;
          if (out === null) {
            return <span className="type-caption text-on-surface-variant/70">{lt.cashNone}</span>;
          }
          // A negative outstanding (overpaid) is surfaced honestly in the alert tone, never clamped.
          return (
            <span className={cn("type-num tnum", out < 0 ? "text-alert" : "text-on-surface")}>
              {usd(out / 100)}
            </span>
          );
        },
      },
      {
        id: "collect",
        header: "",
        enableSorting: false,
        cell: ({ row }) => <CollectCell row={row.original} readOnly={readOnly} />,
      },
    ],
    [readOnly],
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

  return (
    <section aria-label={t.caption}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-caption text-on-surface-variant">{t.rowCount(rows.length)}</p>
      </div>
      {/* The inline collection form would clip under a virtual window, so render the ledger flat. */}
      <VirtualTable table={table} numericIds={LEDGER_NUMERIC} virtualizeOn={false} rowHeight={ROW_HEIGHT} />
    </section>
  );
}

// === Shared scroll/virtual table body ============================================================
// Generic over the row type so BOTH modes (PackerRow, CommitmentLedgerRow) share one body with no
// `any`. Virtualized only when virtualizeOn AND the row count is worth it.

function VirtualTable<TData>({
  table,
  numericIds,
  virtualizeOn,
  rowHeight,
}: {
  table: Table<TData>;
  numericIds: Set<string>;
  virtualizeOn: boolean;
  rowHeight: number;
}) {
  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = virtualizeOn && tableRows.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: virtualize,
  });

  const headerGroups = table.getHeaderGroups();
  const colCount = table.getAllLeafColumns().length;
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualize && virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualize && virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;
  const painted = virtualize
    ? virtualItems
        .map((vi) => tableRows[vi.index])
        .filter((r): r is (typeof tableRows)[number] => r !== undefined)
    : tableRows;

  return (
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
                const isNumeric = numericIds.has(header.column.id);
                const label = String(header.column.columnDef.header ?? "");
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
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={t.sortBy(label)}
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
                    ) : (
                      <span className="type-label-caps text-on-surface-variant">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: paddingTop }} />
            </tr>
          )}
          {painted.map((row) => (
            <tr
              key={row.id}
              style={virtualize ? { height: rowHeight } : undefined}
              className="border-t border-outline-variant first:border-t-0"
            >
              {row.getVisibleCells().map((cell) => {
                const isNumeric = numericIds.has(cell.column.id);
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
              <td colSpan={colCount} style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// === Public component: one prop switches modes ===================================================

export function CropPackerTable({
  rows,
  ledger,
}: {
  rows?: PackerRow[];
  ledger?: { rows: CommitmentLedgerRow[]; readOnly: boolean };
}) {
  if (ledger) {
    return <LedgerTableView rows={ledger.rows} readOnly={ledger.readOnly} />;
  }
  return <PackerTableView rows={rows ?? []} />;
}
