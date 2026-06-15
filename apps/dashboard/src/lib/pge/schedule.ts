// PG&E meter-read schedule (Story 3.5, FR-16): the serial letter printed in a
// bill's Service Information block maps, via the committed 2026 schedule fixture,
// to the meter's SCHEDULED billing-cycle close (the read date). This is the
// planner's forward view; the ACTUAL close comes from the posted bill and the two
// are never conflated (AR-14). The Service Information block also prints a
// Rotating Outage Block (a PSPS code like "14A") - that field NEVER drives
// cycle-close; an outage-block-shaped code is simply not in the table and yields
// null.
//
// PURE module: types + date lookups only, safe in client bundles. The fs loader
// lives in schedule-load.ts (server-only) so a client island can consume the
// loaded table as a prop without dragging node:fs into its chunk. The legacy
// src/lib/greenbutton/schedule.ts keeps serving the demo MR-xx paths; this
// module is the canonical serial-letter path forward.

/** The committed annual schedule: cycle code -> 12 monthly read dates (ISO). */
export type MeterReadSchedule = {
  year: number;
  /** The PDF's printed caveat: reads may shift to a slightly different date. */
  mayShiftNote: string | null;
  cycles: Record<string, string[]>;
};

/** Normalize a stored serial code for lookup ("h " -> "H"). */
function normalizeSerial(serialCode: string): string {
  return serialCode.trim().toUpperCase();
}

/**
 * Whether a stored code resolves in the table at all. Presence of a string is
 * NOT resolvability: a Rotating Outage Block ("14A") or a mis-extracted field
 * is non-null yet drives nothing - callers deciding whether scheduled marks
 * can exist must use this, never a bare null check.
 */
export function isKnownSerial(
  serialCode: string | null,
  schedule: MeterReadSchedule,
): boolean {
  return serialCode !== null && normalizeSerial(serialCode) in schedule.cycles;
}

/**
 * The SCHEDULED cycle-close (read) date for a serial code in a statement month,
 * or null when it cannot be known: unknown serial (including Rotating Outage
 * Block codes like "14A" - only the serial letter drives cycle-close), a month
 * outside 1-12, or a year the table does not cover. Null, never a guess.
 *
 * Note the December wrap: an early letter's JAN statement reads in late December
 * of the PRIOR year (B's January 2026 read is 2025-12-23) - the fixture carries
 * full ISO dates, so the wrap is data, not math.
 */
export function cycleClose(
  serialCode: string,
  month: number,
  year: number,
  schedule: MeterReadSchedule,
): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (year !== schedule.year) return null;
  const dates = schedule.cycles[normalizeSerial(serialCode)];
  return dates?.[month - 1] ?? null;
}

/**
 * The next scheduled close ON OR AFTER `fromIso` (a date-only or full ISO
 * string) for a serial code, or null when the serial is unknown or the
 * schedule's horizon is exhausted (no fabricated date beyond the table).
 */
export function nextCycleClose(
  serialCode: string,
  fromIso: string,
  schedule: MeterReadSchedule,
): string | null {
  const dates = schedule.cycles[normalizeSerial(serialCode)];
  if (!dates) return null;
  const from = fromIso.slice(0, 10);
  for (const date of dates) {
    if (date >= from) return date;
  }
  return null;
}
