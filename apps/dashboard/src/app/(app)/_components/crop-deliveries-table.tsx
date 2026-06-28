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
import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { lbs } from "@/copy/en";
import { deliveriesCsv, distinct, type DeliveryRow } from "@/lib/crops/deliveries";

// Every delivery row from Almond Logic, re-skinned in the Terra palette (the operational detail, not
// the rolled-up position). Headless @tanstack/react-table + @tanstack/react-virtual so hundreds of
// rows stay smooth. Filter by huller / crop year / variety + free-text on load/field; sort any
// column; export exactly what is shown. This component only formats — it never computes a pound.

const ROW_HEIGHT = 48;
const VIRTUALIZE_THRESHOLD = 30;
const NUMERIC = new Set(["grossLb", "tareLb", "netLb"]);
const ALL = "__all__";

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export function CropDeliveriesTable({ rows }: { rows: DeliveryRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "loadId", desc: true }]);
  const [search, setSearch] = useState("");
  const [huller, setHuller] = useState<string>(ALL);
  const [year, setYear] = useState<string>(ALL);
  const [variety, setVariety] = useState<string>(ALL);

  const hullers = useMemo(() => distinct(rows, "huller"), [rows]);
  const years = useMemo(() => distinct(rows, "cropYear"), [rows]);
  const varieties = useMemo(() => distinct(rows, "variety"), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (huller !== ALL && r.huller !== huller) return false;
      if (year !== ALL && String(r.cropYear) !== year) return false;
      if (variety !== ALL && r.variety !== variety) return false;
      if (q) {
        const hay = `${r.loadId} ${r.fieldTicket ?? ""} ${r.field ?? ""} ${r.variety}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, huller, year, variety]);

  const columns = useMemo<ColumnDef<DeliveryRow>[]>(
    () => [
      {
        accessorKey: "loadId",
        header: "Load",
        cell: ({ row }) => (
          <span className="type-num tnum font-medium text-on-surface">{row.original.loadId}</span>
        ),
      },
      {
        accessorKey: "fieldTicket",
        header: "Field Ticket",
        cell: ({ row }) => (
          <span className="type-num tnum text-on-surface-variant">{row.original.fieldTicket ?? "—"}</span>
        ),
      },
      {
        accessorKey: "field",
        header: "Field",
        cell: ({ row }) => <span className="type-num text-on-surface">{row.original.field ?? "—"}</span>,
      },
      {
        accessorKey: "variety",
        header: "Variety",
        cell: ({ row }) => <span className="type-num text-on-surface">{row.original.variety}</span>,
      },
      {
        accessorKey: "grossLb",
        header: "Gross",
        cell: ({ row }) => <span className="type-num tnum text-on-surface-variant">{lbs(row.original.grossLb)}</span>,
      },
      {
        accessorKey: "tareLb",
        header: "Tare",
        cell: ({ row }) => <span className="type-num tnum text-on-surface-variant">{lbs(row.original.tareLb)}</span>,
      },
      {
        accessorKey: "netLb",
        header: "Net",
        cell: ({ row }) => <span className="type-num tnum font-medium text-on-surface">{lbs(row.original.netLb)}</span>,
      },
      {
        accessorKey: "deliveryDate",
        header: "Date",
        cell: ({ row }) => <span className="type-num text-on-surface-variant">{dateLabel(row.original.deliveryDate)}</span>,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
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
    overscan: 14,
    enabled: virtualize,
  });

  const exportCsv = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const ordered = tableRows.map((r) => r.original);
    const blob = new Blob([deliveriesCsv(ordered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terra-deliveries-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const headerGroups = table.getHeaderGroups();
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualize && virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0;
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
    <section aria-label="Deliveries">
      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search load, field, variety"
          className="h-10 w-full sm:w-64"
          aria-label="Search deliveries"
        />
        {hullers.length > 1 && (
          <FilterSelect value={huller} onChange={setHuller} label="All hullers" options={hullers.map(String)} />
        )}
        {years.length > 1 && (
          <FilterSelect value={year} onChange={setYear} label="All years" options={years.map(String)} />
        )}
        {varieties.length > 1 && (
          <FilterSelect value={variety} onChange={setVariety} label="All varieties" options={varieties.map(String)} />
        )}
        <div className="ml-auto flex items-center gap-3">
          <p className="type-caption text-on-surface-variant">
            {filtered.length} of {rows.length} deliveries
          </p>
          <Button type="button" variant="outline" size="lg" onClick={exportCsv} className="min-h-[40px]">
            Export CSV
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[34rem] overflow-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1"
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-container-lowest">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const isNumeric = NUMERIC.has(header.column.id);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "whitespace-nowrap border-b border-outline-variant px-3 py-2.5",
                        isNumeric ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
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
                className="border-t border-outline-variant first:border-t-0 hover:bg-surface-container-low/40"
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

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-auto min-w-[8rem]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
