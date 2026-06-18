// Pure CSV builder for the Table lens export (Story 2.7, FR-22). Takes the exact MeterRow[]
// the table is rendering (already filtered + sorted upstream) and mirrors its cell semantics:
// a reconciled meter exports its real figures (negative NEM credits included); an unreconciled
// meter's money cells export the coverage LABEL, never a fabricated number; null inventory
// fields export as empty cells (the on-screen em-dash placeholder is presentation, not data).
// RFC-4180 escaping, CRLF rows, and a UTF-8 BOM so Excel opens it cleanly. No DOM here - the
// component only triggers the download.

import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import type { MeterRow } from "./table";

const t = en.shell.table;

/** Quote a field when it carries a delimiter, quote, or newline; double inner quotes. */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function moneyCell(row: MeterRow, cents: number | null, kind: "cost" | "demand"): string {
  if (row.coverageState !== "reconciled") return t.coverage[row.coverageState];
  if (cents === null) return kind === "demand" ? t.none : "";
  return formatUsd(cents);
}

/** The nine table headers, in order. Exported so the XLSX export (Story 8.2) writes the SAME
    operator headers as this CSV - one header definition, never a parallel spreadsheet format. */
export function metersHeader(): string[] {
  const c = t.columns;
  return [c.name, c.ranch, c.entity, c.rate, c.legacy, c.cost, c.demand, c.status, c.coverage];
}

/** The nine cell STRINGS for one meter row, in header order, carrying the exact cell semantics
    this CSV exports: a reconciled meter's real figures; the coverage LABEL (never a number) for an
    unreconciled meter's money cells; "None" for a reconciled meter with no demand charge; an empty
    string for a null inventory field. Exported so the XLSX export reuses these identical cells -
    the money/coverage rule lives here once, not duplicated per format. */
export function meterCells(row: MeterRow): string[] {
  return [
    row.name,
    row.ranch ?? "",
    row.entity ?? "",
    row.rate ?? "",
    row.isLegacy ? t.legacyFlag : "",
    moneyCell(row, row.costCents, "cost"),
    moneyCell(row, row.demandCents, "demand"),
    row.status ?? "",
    t.coverage[row.coverageState],
  ];
}

export function metersCsv(rows: readonly MeterRow[]): string {
  const lines = [metersHeader(), ...rows.map(meterCells)];
  // BOM so Excel reads UTF-8 (the \uFEFF escape, never a raw invisible char a formatter
  // could silently strip); CRLF row endings per RFC 4180.
  return "\uFEFF" + lines.map((line) => line.map(escapeField).join(",")).join("\r\n") + "\r\n";
}
