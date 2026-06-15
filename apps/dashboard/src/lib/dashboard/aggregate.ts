// Pure aggregation for the drill-down levels: roll a flat list of billing periods, each
// tagged with a group key (entity id, account id, ranch id, or pump id), into per-group
// spend and usage summaries with a month-ordered spend series for the sparkline. No UI, no
// DB; the pages fetch the periods with the right key and call this.

export type GroupPeriod = {
  /** The group this period rolls into (entity / account / ranch / meter id). */
  key: string;
  /** Cycle close, ISO 8601 (orders the series and picks the latest cycle). */
  close: string;
  totalBillUsd: number | null;
  totalKwh: number | null;
};

export type GroupSummary = {
  key: string;
  /** Total billed across the periods in the window. */
  spend: number;
  /** Total metered energy (kWh) across the window; 0 when no metered cycles. */
  kwh: number;
  /** The most recent cycle's spend. */
  latestSpend: number;
  /** Per-month spend, oldest to newest, for a sparkline. */
  spendSeries: number[];
};

/** Roll periods into one summary per group key. */
export function summarizeGroups(rows: readonly GroupPeriod[]): Map<string, GroupSummary> {
  // key -> month -> { spend, kwh }
  const byKey = new Map<string, Map<string, { spend: number; kwh: number }>>();
  for (const r of rows) {
    const month = r.close.slice(0, 7);
    const months = byKey.get(r.key) ?? new Map<string, { spend: number; kwh: number }>();
    const cell = months.get(month) ?? { spend: 0, kwh: 0 };
    cell.spend += r.totalBillUsd ?? 0;
    cell.kwh += r.totalKwh ?? 0;
    months.set(month, cell);
    byKey.set(r.key, months);
  }

  const out = new Map<string, GroupSummary>();
  for (const [key, months] of byKey) {
    const ordered = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const spendSeries = ordered.map(([, c]) => Math.round(c.spend));
    const spend = ordered.reduce((s, [, c]) => s + c.spend, 0);
    const kwh = ordered.reduce((s, [, c]) => s + c.kwh, 0);
    const latestSpend = ordered.length ? ordered[ordered.length - 1]![1].spend : 0;
    out.set(key, {
      key,
      spend: Math.round(spend),
      kwh: Math.round(kwh),
      latestSpend: Math.round(latestSpend),
      spendSeries,
    });
  }
  return out;
}

/** Empty summary for a group with no periods, so the UI renders zeros, not undefined. */
export function emptySummary(key: string): GroupSummary {
  return { key, spend: 0, kwh: 0, latestSpend: 0, spendSeries: [] };
}
