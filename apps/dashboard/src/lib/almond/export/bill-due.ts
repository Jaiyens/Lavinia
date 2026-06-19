// The bill-due-schedule export (Story 8.3): a serial-code / calendar export of each meter's
// billing-cycle close, in the SAME row/money conventions as the meter spreadsheet (Story 8.2) and
// off the SAME uncapped full-data loader (Story 8.1, ./load.ts -> ExportData). It answers "when does
// each pump's bill lock in" without ever pretending a future date is final.
//
// THE BILLED-vs-SCHEDULED LAW (mirrors the calendar lens AR-14): a close has one of two provenances
// and the two are NEVER conflated.
//   - BILLED:    the close printed on a posted bill (a period whose printedTotalCents is set). A
//                fact from the bill; final.
//   - SCHEDULED: PG&E's planned read date for the meter's serial letter, from the committed
//                schedule (src/lib/greenbutton/schedule.ts). It MAY SHIFT, is labeled so, and is
//                never emitted with the BILLED status. A meter with neither (no posted bill and an
//                unknown/absent serial) shows a coverage label and an empty date cell - never a
//                fabricated or zero date.
// A unit test (bill-due.test.ts) pins the law: a scheduled date is never emitted as billed.
//
// REUSE, not a parallel format: the CSV renders through the ONE CSV mechanism (gridCsv) and the
// XLSX through the ONE workbook builder (buildGridWorkbook), the same builders the meter table uses,
// so the two exports can never drift. The scheduled-close lookup reuses the greenbutton schedule
// loader and the pure closeOnOrAfter math (src/lib/energy/billing.ts) - the same path
// closeDateForSerial is built on - so there is no second schedule lookup.
//
// The row builder is PURE (no clock, no fs): callers pass the loaded schedule and a reference date,
// exactly like the calendar lens. The thin CSV/XLSX entry points load the real schedule and read
// the clock once. Farm scope is inherited from the ExportData the 8.1 loader produced; no caller
// ever passes a farm id here.

import { en } from "@/copy/en";
import { closeOnOrAfter } from "@/lib/energy/billing";
import { gridCsv } from "@/lib/dashboard/csv";
import { loadMeterReadSchedule, type MeterReadSchedule } from "@/lib/greenbutton/schedule";
import { buildGridWorkbook } from "./xlsx";
import type { ExportData } from "./load";
import type { MeterView } from "@/lib/dashboard/load";

const t = en.shell.almond.export.billDue;

/** The provenance of a close date. Mirrors the calendar lens' actual/scheduled split (AR-14):
    a billed date is final; a scheduled date may shift and is never shown as billed. */
export type CloseKind = "billed" | "scheduled" | "no_serial" | "no_schedule";

/** One meter's bill-due row, deterministically authored from its bills + serial. `closeDate` is an
    ISO date-only string (YYYY-MM-DD) or null when no date can be shown (no fabricated date). */
export type BillDueRow = {
  meterName: string;
  ranch: string | null;
  /** The serial code as stored (the cycle letter that drives the scheduled close); null when none. */
  serial: string | null;
  closeDate: string | null;
  kind: CloseKind;
};

/** Normalize a stored serial for the schedule lookup ("h " -> "H"); matches the calendar lens. */
function normalizeSerial(serial: string): string {
  return serial.trim().toUpperCase();
}

/** The latest BILLED close on a meter: the close of the most recent period carrying a posted total
    (printedTotalCents set). Periods are start-ascending, but we compare close dates so the latest
    billed cycle wins. Null when no period is posted - a metered/scheduled end (printedTotalCents
    null) is NOT a billed close and is never returned here. */
function latestBilledClose(meter: MeterView): string | null {
  let latest: string | null = null;
  for (const p of meter.periods) {
    if (p.printedTotalCents === null) continue; // not a posted bill: never billed
    const close = p.close.slice(0, 10);
    if (latest === null || close > latest) latest = close;
  }
  return latest;
}

/** The next SCHEDULED close on or after `ref` for a meter's serial, or null when the serial is
    absent/unknown or the schedule's horizon is exhausted. Reuses the pure closeOnOrAfter math over
    the loaded schedule - the same path closeDateForSerial is built on - so there is no second
    lookup. Never a fabricated date. */
function scheduledClose(
  meter: MeterView,
  schedule: MeterReadSchedule,
  ref: string,
): string | null {
  if (meter.serialCode === null) return null;
  const dates = schedule.cycles[normalizeSerial(meter.serialCode)];
  if (dates === undefined) return null;
  return closeOnOrAfter(dates, ref);
}

/**
 * Build one bill-due row per meter (the full inventory, no cap, in the loader's name order). For
 * each meter, a posted bill's close wins (BILLED); else the serial's next scheduled read (SCHEDULED,
 * may shift); else a coverage label with an empty date (no_serial / no_schedule). A SCHEDULED close
 * is NEVER tagged billed - that is the billed-vs-scheduled law, asserted in the test. Pure: takes
 * the loaded schedule and the reference date, reads no clock and no fs.
 */
export function buildBillDueRows(
  data: ExportData,
  schedule: MeterReadSchedule,
  ref: string,
): BillDueRow[] {
  return data.meters.map((meter) => {
    const billed = latestBilledClose(meter);
    if (billed !== null) {
      return { meterName: meter.name, ranch: meter.ranchName, serial: meter.serialCode, closeDate: billed, kind: "billed" };
    }
    // No posted bill: fall to the serial's scheduled read. A scheduled date is labeled scheduled and
    // never billed; absence of a serial or a schedule entry shows a coverage label, never a date.
    if (meter.serialCode === null) {
      return { meterName: meter.name, ranch: meter.ranchName, serial: null, closeDate: null, kind: "no_serial" };
    }
    const scheduled = scheduledClose(meter, schedule, ref);
    if (scheduled === null) {
      return { meterName: meter.name, ranch: meter.ranchName, serial: meter.serialCode, closeDate: null, kind: "no_schedule" };
    }
    return { meterName: meter.name, ranch: meter.ranchName, serial: meter.serialCode, closeDate: scheduled, kind: "scheduled" };
  });
}

/** The five bill-due headers, in order. One header definition shared by the CSV and the XLSX. */
export function billDueHeader(): string[] {
  const c = t.columns;
  return [c.meter, c.ranch, c.serial, c.closeDate, c.status];
}

/** The status cell for a row's provenance. The discriminator that keeps a scheduled date from ever
    reading as billed: a billed close says "Billed"; a scheduled close says "Scheduled (may shift)";
    a meter with no date shows the matching coverage label. */
function statusCell(kind: CloseKind): string {
  switch (kind) {
    case "billed":
      return t.status.billed;
    case "scheduled":
      return t.status.scheduled;
    case "no_serial":
      return t.status.noSerial;
    case "no_schedule":
      return t.status.noSchedule;
  }
}

/** The five cell STRINGS for one bill-due row, in header order. A null ranch is an empty cell; a
    null serial is an empty cell; a null close date is the empty-date placeholder (paired with a
    status that explains why there is no date). The status cell carries the billed-vs-scheduled
    mark, so a date is never silently presented as final. */
export function billDueCells(row: BillDueRow): string[] {
  return [
    row.meterName,
    row.ranch ?? "",
    row.serial ?? "",
    row.closeDate ?? t.noDate,
    statusCell(row.kind),
  ];
}

/** Per-provenance counts for the coverage footer. A genuine zero is reported as 0, never omitted. */
function summarize(rows: readonly BillDueRow[]): { total: number; billed: number; scheduled: number } {
  let billed = 0;
  let scheduled = 0;
  for (const r of rows) {
    if (r.kind === "billed") billed += 1;
    else if (r.kind === "scheduled") scheduled += 1;
  }
  return { total: rows.length, billed, scheduled };
}

/** The two footer lines: a coverage statement (how the meters split across billed / scheduled / no
    date, so nothing is silently left out) and the honesty note (a scheduled date may shift and is
    never a billed total). Shared by the CSV and the XLSX. */
function billDueFooter(rows: readonly BillDueRow[]): string[] {
  const { total, billed, scheduled } = summarize(rows);
  return [t.coverageFooter(total, billed, scheduled), t.note];
}

/**
 * The bill-due schedule as CSV, rendered through the ONE CSV mechanism (gridCsv) so it carries the
 * exact BOM / RFC-4180 escaping / CRLF the meter export uses - no parallel CSV format. Every meter
 * is listed (no cap); a scheduled date is marked scheduled in its status cell and never shown as
 * billed; a meter with no date shows a coverage label, never a fabricated date. Pure given a
 * schedule + reference date.
 */
export function billDueCsvFromSchedule(
  data: ExportData,
  schedule: MeterReadSchedule,
  ref: string,
): string {
  const rows = buildBillDueRows(data, schedule, ref);
  return gridCsv([billDueHeader(), ...rows.map(billDueCells), [], ...billDueFooter(rows).map((line) => [line])]);
}

/**
 * The bill-due schedule as a real .xlsx workbook, rendered through the ONE workbook builder
 * (buildGridWorkbook) so it shares the meter export's layout (title, bold header, every row in
 * order, footer) - no parallel workbook format. Pure given a schedule + reference date.
 */
export function billDueWorkbookFromSchedule(
  data: ExportData,
  schedule: MeterReadSchedule,
  ref: string,
): Promise<Uint8Array> {
  const rows = buildBillDueRows(data, schedule, ref);
  return buildGridWorkbook({
    sheetName: t.sheetName,
    title: t.title(data.farm.name),
    header: billDueHeader(),
    rows: rows.map(billDueCells),
    footer: billDueFooter(rows),
    // The closing-date column (index 3) carries ISO date strings; render them as real Excel dates so
    // a reader can sort and filter by date. The shared house style (forest header band, frozen
    // header, AutoFilter) comes from buildGridWorkbook.
    dateColumns: [3],
  });
}

/** Read the clock once (UTC date-only) for the entry points below; the row math stays pure. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The bill-due schedule export as CSV. Loads the real committed schedule (greenbutton/schedule.ts)
 * and reads the clock once, then renders through the pure path. Farm scope is inherited from
 * `data` (the 8.1 full-data loader); no farm id crosses this boundary.
 */
export function exportBillDueCsv(data: ExportData): string {
  return billDueCsvFromSchedule(data, loadMeterReadSchedule(), todayIso());
}

/** The bill-due schedule export as a .xlsx workbook. Same provenance as exportBillDueCsv. */
export function buildBillDueWorkbook(data: ExportData): Promise<Uint8Array> {
  return billDueWorkbookFromSchedule(data, loadMeterReadSchedule(), todayIso());
}
