// Pure CSV builder for the Table lens export (Story 2.7, FR-22). Takes the exact MeterRow[]
// the table is rendering (already filtered + sorted upstream) and mirrors its cell semantics:
// a reconciled meter exports its real figures (negative NEM credits included); an unreconciled
// meter's money cells export the coverage LABEL, never a fabricated number; null inventory
// fields export as empty cells (the on-screen em-dash placeholder is presentation, not data).
// RFC-4180 escaping, CRLF rows, and a UTF-8 BOM so Excel opens it cleanly. No DOM here - the
// component only triggers the download.

import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import type { MeterView } from "./load";
import type { MeterRow } from "./table";

const t = en.shell.table;
const st = en.solar.table;

/** Quote a field when it carries a delimiter, quote, or newline; double inner quotes. */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Serialize a grid of cell STRINGS as one RFC-4180 CSV document: a leading UTF-8 BOM (the
    \uFEFF escape, never a raw invisible char a formatter could silently strip, so Excel reads
    UTF-8), RFC-4180 field escaping, and CRLF row endings. This is the ONE CSV mechanism in the
    app; the meter export (metersCsv) and the Almond bill-due export (Story 8.3) both render
    through it, so the two can never drift to a second CSV format. Pure: the caller authors every
    cell, including the header row. */
export function gridCsv(rows: readonly (readonly string[])[]): string {
  return "\uFEFF" + rows.map((line) => line.map(escapeField).join(",")).join("\r\n") + "\r\n";
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
  // The meter-table CSV is exactly the grid CSV over the header + cell rows: one CSV mechanism
  // (gridCsv) carries the BOM, escaping and CRLF, so this export and the bill-due export
  // (Story 8.3) can never drift.
  return gridCsv([metersHeader(), ...rows.map(meterCells)]);
}

// ---------------------------------------------------------------------------------------------
// The Solar tab CSV export (A-8, FR36, UX-DR7). The farm-office controller stops maintaining the
// parallel array-to-meter spreadsheet by hand: one click writes the per-meter solar table AND the
// array-to-meter allocation map, through the SAME gridCsv mechanism (BOM + RFC-4180 + CRLF), so the
// solar export can never drift to a second CSV format.
//
// HONEST-BLANK discipline (the one law): the allocation PERCENTAGE arrives in Epic C and the credit
// DOLLAR is settled only by a true-up statement (Epic G). Until then the allocation cell exports the
// literal `not on file` marker (st.allocationNotOnFile) - never a blank cell that reads as zero, never
// a fabricated %, never a percent multiplied into a dollar. The program code reads the generic NEM2
// program for a `nem2*` token and not-on-file otherwise (FR2/FR5), never a guessed granular code.

/** The program-code CSV cell: a `nem2*` token reads the generic NEM2 program; an absent or
    unrecognized token reads not-on-file. Mirrors the Arrays-lens chip rule (FR2/FR5); A-4's
    resolveProgramCode refines the granular label later. Pure, no inference from an adjacent meter. */
function solarProgramCell(nemType: string | null): string {
  if (nemType !== null && nemType.toLowerCase().startsWith("nem2")) return st.programGeneric;
  return st.programNotOnFile;
}

/** The array-membership CSV cell: the arrays this meter sits under, in loaded order, joined; none
    reads not-on-file. Reads `benefitingArrays[].name` (the populator's NEMA-code name), never a
    nonexistent Pump column, never a guessed code. */
function arrayMembershipCell(m: MeterView): string {
  const names = m.benefitingArrays
    .map((a) => a.name)
    .filter((n): n is string => n !== null && n.trim() !== "");
  return names.length > 0 ? names.join(st.arrayJoin) : st.arrayNone;
}

/** The seven solar table headers, in order. Exported so the on-screen Table lens and the CSV write
    the SAME operator headers - one header definition, never a parallel solar spreadsheet format. */
export function solarHeader(): string[] {
  const c = st.columns;
  return [c.name, c.program, c.nameplate, c.array, c.allocation, c.trueUp, c.coverage];
}

/** The seven cell STRINGS for one solar meter row, in header order: program code, nameplate (plain
    words, not-on-file when null), array membership, the honest-blank allocation marker, true-up month,
    and the shared coverage label. Pure. */
export function solarMeterCells(m: MeterView): string[] {
  return [
    m.name,
    solarProgramCell(m.nemType),
    m.solarKw !== null ? st.nameplate(m.solarKw) : st.nameplateNotOnFile,
    arrayMembershipCell(m),
    // The usage-proportional share is honest-blank until Epic C; the dollar is honest-blank until a
    // statement settles it (FR36): the explicit not-on-file marker, never a blank cell reading as zero.
    st.allocationNotOnFile,
    m.trueUpMonth !== null ? st.trueUpMonth(m.trueUpMonth) : st.trueUpNone,
    t.coverage[m.coverageState],
  ];
}

/** Build the array-to-meter allocation-map grid rows (FR36): a section title row, a per-array header,
    then one indented line per benefiting meter carrying its honest-blank share. Inverts the meters'
    benefitingArrays linkage exactly as the Arrays lens does (display-only, cross-entity grouping),
    keyed by array id so a re-listed array appears once, ordered by array name. The credit dollar never
    appears here; the share is the honest-blank marker until Epic C. Pure. */
function allocationMapRows(solar: readonly MeterView[]): string[][] {
  type Group = { name: string; nameplateKw: number; meters: string[] };
  const groups = new Map<string, Group>();
  for (const m of solar) {
    for (const arr of m.benefitingArrays) {
      let group = groups.get(arr.id);
      if (!group) {
        group = { name: arr.name ?? en.solar.arrays.unnamed, nameplateKw: arr.nameplateKw, meters: [] };
        groups.set(arr.id, group);
      }
      group.meters.push(m.name);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  const rows: string[][] = [[st.mapSectionTitle]];
  for (const group of ordered) {
    rows.push([st.mapArrayLabel, group.name, st.mapNameplateLabel, st.nameplate(group.nameplateKw)]);
    rows.push([st.mapMeterLabel, st.mapShareLabel]);
    for (const meterName of group.meters) {
      rows.push([meterName, st.allocationNotOnFile]);
    }
  }
  return rows;
}

/** The solar CSV: the per-meter solar table (one row per solar meter, in the order passed) followed by
    the array-to-meter allocation map, all through the one gridCsv mechanism. `rows` is the exact set
    the Table lens is showing (already filtered + sorted upstream), so the export round-trips the
    visible table. Pure; the caller (the Table lens) only triggers the download. */
export function solarMetersCsv(rows: readonly MeterView[]): string {
  return gridCsv([
    solarHeader(),
    ...rows.map(solarMeterCells),
    // A blank spacer row, then the allocation map, so the two sections read as distinct in Excel.
    [""],
    ...allocationMapRows(rows),
  ]);
}
