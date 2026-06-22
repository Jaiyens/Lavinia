// The full, multi-tab workbook (the rich default for a plain "export"/"make me an excel" ask). It is
// the Claude/Perplexity-grade artifact: a Summary cover tab, the Meters inventory, the Bill due
// dates, and the Rate savings, each a styled sheet (header band, frozen header, autofilter, real
// currency, zebra) built by the ONE styled builder (./workbook.ts). Every value is authored
// deterministically off the SAME grounded sources the focused exports and the dashboard read (the
// 8.1 loader, the KPI rollup, the farm findings), so the workbook can never disagree with a
// single-table export or the screen. The model picks the SHAPE (a workbook vs a focused table); this
// code authors the bytes.
//
// Pure given its inputs: it takes the loaded ExportData, the farm findings, the meter-read schedule,
// and a reference date, and reads no clock or fs of its own (the skill entry point loads the schedule
// and reads the clock once, exactly like ./bill-due.ts). Farm scope is inherited from the ExportData
// the loader produced; no farm id crosses this boundary.

import { en } from "@/copy/en";
import { metersHeader } from "@/lib/dashboard/csv";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { loadMeterReadSchedule, type MeterReadSchedule } from "@/lib/greenbutton/schedule";
import { meterRowsForExport } from "./rows";
import { meterCellsTyped, billDueCellsTyped } from "./cells";
import { buildBillDueRows, billDueHeader } from "./bill-due";
import { composeCoverageFooter, coveragePercent } from "./coverage-footer";
import { buildStyledWorkbook, type SheetCell, type SheetSpec } from "./workbook";
import type { ExportData } from "./load";

const t = en.shell.almond.export.workbook;

/** A rate-switch suggestion grounded in a finding: the meter, its suggested rate, and the dollar
 *  impact in integer cents. Mirrors the generate-report skill's `readRateSwitch` so the workbook's
 *  savings tab and the PDF savings section agree. */
type RateSwitch = { meterId: string; toRate: string; savingsCents: number };

/** Extract a rate-switch from a finding, or null when it is not a meter-level switch_rate finding.
 *  `rateSwitchTo` is non-null exactly when the stored action is a `switch_rate` with a readable rate;
 *  the savings is the finding's dollar impact converted to a non-negative whole cent. */
function readRateSwitch(finding: FindingView): RateSwitch | null {
  if (finding.meterId === null || finding.rateSwitchTo === null) return null;
  const savingsCents = Math.max(0, Math.round((finding.impactUsd ?? 0) * 100));
  return { meterId: finding.meterId, toRate: finding.rateSwitchTo, savingsCents };
}

/** The Summary cover tab: the farm at a glance, every figure grounded. An unreconciled-only farm
 *  shows the honest "no bills posted yet" line for spend/demand (never a fabricated $0). */
function summarySheet(data: ExportData, findings: readonly FindingView[]): SheetSpec {
  const kpi = computeKpiStrip(data.meters);
  const { total, reconciled } = data.state.coverage;
  const metersById = new Map(data.meters.map((m) => [m.id, m]));
  const savingsCents = findings.reduce((sum, f) => {
    const sw = readRateSwitch(f);
    return sw !== null && metersById.has(sw.meterId) ? sum + sw.savingsCents : sum;
  }, 0);

  const spendCell: SheetCell =
    reconciled === 0 ? { value: t.notOnFile, format: "label" } : { value: kpi.spend.cents / 100, format: "currency" };
  const demandCell: SheetCell = kpi.demand.hasDemand
    ? { value: kpi.demand.cents / 100, format: "currency" }
    : { value: t.none, format: "label" };
  const savingsCell: SheetCell =
    savingsCents > 0 ? { value: savingsCents / 100, format: "currency" } : { value: t.none, format: "label" };

  const rows: SheetCell[][] = [
    [{ value: t.metric.farm }, { value: data.farm.name }],
    [{ value: t.metric.meters }, { value: total, format: "integer" }],
    [{ value: t.metric.reconciled }, { value: reconciled, format: "integer" }],
    [{ value: t.metric.completeness }, { value: t.completeness(coveragePercent(data.state)) }],
    [{ value: t.metric.spend }, spendCell],
    [{ value: t.metric.demand }, demandCell],
    [{ value: t.metric.savings }, savingsCell],
  ];

  return {
    name: t.summarySheet,
    title: t.summaryTitle(data.farm.name),
    columns: [{ header: t.summaryColumns.metric }, { header: t.summaryColumns.value }],
    rows,
    footer: composeCoverageFooter(data.state),
    autoFilter: false, // a two-column key/value sheet, not a filterable table
  };
}

/** The Meters inventory tab: every meter, with real currency in the money columns and the coverage
 *  label for an unreconciled meter (never a fabricated figure). The same nine columns as the CSV. */
function metersSheet(data: ExportData): SheetSpec {
  return {
    name: t.metersSheet,
    title: t.metersTitle(data.farm.name),
    columns: metersHeader().map((header) => ({ header })),
    rows: meterRowsForExport(data).map(meterCellsTyped),
    footer: composeCoverageFooter(data.state),
  };
}

/** The Bill due dates tab: each meter's billing-cycle close, marked billed vs scheduled (a scheduled
 *  date is never shown as final). Reuses the bill-due row builder + status cells verbatim. */
function billsSheet(data: ExportData, schedule: MeterReadSchedule, ref: string): SheetSpec {
  const rows = buildBillDueRows(data, schedule, ref);
  let billed = 0;
  let scheduled = 0;
  for (const r of rows) {
    if (r.kind === "billed") billed += 1;
    else if (r.kind === "scheduled") scheduled += 1;
  }
  const bd = en.shell.almond.export.billDue;
  return {
    name: t.billsSheet,
    title: t.billsTitle(data.farm.name),
    columns: billDueHeader().map((header) => ({ header })),
    rows: rows.map(billDueCellsTyped),
    footer: [bd.coverageFooter(rows.length, billed, scheduled), bd.note],
  };
}

/** The Rate savings tab: the in-scope rate-switch meters with their current and suggested rate and the
 *  estimated annual savings (real currency), plus a bold totals band. An empty set renders the honest
 *  empty line, never a fabricated zero-row table. */
function savingsSheet(data: ExportData, findings: readonly FindingView[]): SheetSpec {
  const metersById = new Map(data.meters.map((m) => [m.id, m] as const));
  const switches: { meter: MeterView; toRate: string; savingsCents: number }[] = [];
  for (const f of findings) {
    const sw = readRateSwitch(f);
    if (sw === null) continue;
    const meter = metersById.get(sw.meterId);
    if (meter === undefined) continue; // outside the (filtered) set in scope
    switches.push({ meter, toRate: sw.toRate, savingsCents: sw.savingsCents });
  }

  const rows: SheetCell[][] = switches.map((s) => [
    { value: s.meter.name },
    { value: s.meter.ranchName ?? "" },
    { value: s.meter.rateSchedule ?? "" },
    { value: s.toRate },
    { value: s.savingsCents / 100, format: "currency" },
  ]);

  const columns = [
    { header: t.savingsColumns.meter },
    { header: t.savingsColumns.ranch },
    { header: t.savingsColumns.current },
    { header: t.savingsColumns.suggested },
    { header: t.savingsColumns.savings },
  ];

  if (rows.length === 0) {
    return { name: t.savingsSheet, title: t.savingsTitle(data.farm.name), columns, rows: [], footer: [t.savingsEmpty] };
  }

  const totalCents = switches.reduce((sum, s) => sum + s.savingsCents, 0);
  const totals: SheetCell[] = [
    { value: t.savingsTotal },
    { value: "" },
    { value: "" },
    { value: "" },
    { value: totalCents / 100, format: "currency" },
  ];
  return { name: t.savingsSheet, title: t.savingsTitle(data.farm.name), columns, rows, footer: [t.savingsNote], totals };
}

/** Read the clock once (UTC date-only) for the entry point; the sheet authors stay pure. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build the full multi-tab workbook for an export. Pure given a reference date (defaulted to today)
 * so a test can pin the scheduled bill-due dates. Loads the committed meter-read schedule (a fixture,
 * zero external calls) for the Bill due dates tab. Farm scope is inherited from `data`.
 */
export function buildFullWorkbook(
  data: ExportData,
  findings: readonly FindingView[],
  ref: string = todayIso(),
): Promise<Uint8Array> {
  const schedule = loadMeterReadSchedule();
  return buildStyledWorkbook({
    sheets: [summarySheet(data, findings), metersSheet(data), billsSheet(data, schedule, ref), savingsSheet(data, findings)],
  });
}
