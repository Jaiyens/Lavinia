// Bills surface: upcoming PG&E bills rolled up across accounts, for the top card of the landing.
// Time-sensitive money leads, so this is the most prominent surface. Three states by priority:
// overdue (disconnection risk) > due this week > all current.
//
// Bill amounts are real (the account's printed bill totals). The due date is derived from the
// cycle close (PG&E bills are due ~21 days after close) until the connected account's exact due
// date is wired - that is a derivation, not OCR, so no "confirm" hedge is shown.
//
// Demo note: the representative seed is historical, so if "today" is past every derived due date,
// the as-of point is anchored to the soonest due so the surface reads as upcoming rather than a
// wall of overdue. Production data is current, so the real `todayIso` is used directly.

import type { MeterView } from "./load";

const DUE_OFFSET_DAYS = 21;
const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

export type BillsState = "overdue" | "due" | "current";

export type BillsScan = {
  state: BillsState;
  /** Amount in the leading bucket: this-week total, overdue total, or the next single bill. */
  totalCents: number;
  /** Number of bills in that bucket. */
  count: number;
  /** Soonest due date in the bucket (ISO YYYY-MM-DD), or null when nothing is on file. */
  soonestDueIso: string | null;
};

type Bill = { dueMs: number; cents: number };
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function scanBills(meters: readonly MeterView[], todayIso: string): BillsScan {
  // Latest reconciled bill per account (max close; summed across the account's meters at that cycle).
  const byAccount = new Map<string, { closeMs: number; cents: number }>();
  for (const m of meters) {
    if (m.coverageState !== "reconciled" || m.accountNumber === null) continue;
    for (const p of m.periods) {
      if (p.printedTotalCents === null) continue;
      const closeMs = Date.parse(p.close);
      if (Number.isNaN(closeMs)) continue;
      const cur = byAccount.get(m.accountNumber);
      if (cur === undefined || closeMs > cur.closeMs) {
        byAccount.set(m.accountNumber, { closeMs, cents: p.printedTotalCents });
      } else if (closeMs === cur.closeMs) {
        cur.cents += p.printedTotalCents;
      }
    }
  }

  const bills: Bill[] = [...byAccount.values()].map((b) => ({
    dueMs: b.closeMs + DUE_OFFSET_DAYS * DAY_MS,
    cents: b.cents,
  }));
  if (bills.length === 0) {
    return { state: "current", totalCents: 0, count: 0, soonestDueIso: null };
  }

  const dues = bills.map((b) => b.dueMs);
  const minDue = Math.min(...dues);
  const maxDue = Math.max(...dues);
  const realToday = Date.parse(`${todayIso}T00:00:00`);
  // Historical-demo anchor (see file note): only shifts the as-of point when the whole dataset is
  // already past; production data is current and uses the real today.
  const asOf = realToday > maxDue ? minDue : realToday;

  const sum = (arr: Bill[]) => arr.reduce((s, b) => s + b.cents, 0);
  const soonest = (arr: Bill[]) => iso(Math.min(...arr.map((b) => b.dueMs)));

  const overdue = bills.filter((b) => b.dueMs < asOf);
  if (overdue.length > 0) {
    return {
      state: "overdue",
      totalCents: sum(overdue),
      count: overdue.length,
      soonestDueIso: soonest(overdue),
    };
  }

  const dueThisWeek = bills.filter((b) => b.dueMs >= asOf && b.dueMs <= asOf + WEEK_DAYS * DAY_MS);
  if (dueThisWeek.length > 0) {
    return {
      state: "due",
      totalCents: sum(dueThisWeek),
      count: dueThisWeek.length,
      soonestDueIso: soonest(dueThisWeek),
    };
  }

  // All current: surface the next single upcoming bill (soonest future due).
  const upcoming = bills.filter((b) => b.dueMs > asOf + WEEK_DAYS * DAY_MS);
  if (upcoming.length === 0) return { state: "current", totalCents: 0, count: 0, soonestDueIso: null };
  const nextDue = Math.min(...upcoming.map((b) => b.dueMs));
  const next = upcoming.find((b) => b.dueMs === nextDue);
  return {
    state: "current",
    totalCents: next ? next.cents : 0,
    count: upcoming.length,
    soonestDueIso: iso(nextDue),
  };
}
