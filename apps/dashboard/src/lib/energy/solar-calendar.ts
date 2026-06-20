// The true-up calendar (D-1, FR12/FR13). PURE math, no Prisma, no React, no I/O, no clock: it takes
// plain true-up entries (a meter or array carrying a settle month) plus an injected `todayMonth` and
// places each entry on a twelve-month grid rolling forward from today, then names the next-upcoming
// month. This is the annual heartbeat the PRD leads Epic D with: the grower reaches each true-up
// already knowing the date and structure, so the reconciliation is a pre-empted event, not an ambush.
//
// PURE BY CONSTRUCTION (NFR1). The "now" / "today" is ALWAYS the injected `todayMonth` argument
// (1-12), never read from a clock. The function reads only the passed entries; there is no I/O, no
// Date.now(), no Prisma. It is proven in isolation with a colocated *.test.ts.
//
// HONEST-BLANK discipline (the one law, FR14): this module places STRUCTURE and TIMING only - which
// month each meter and array settles - and NEVER a true-up credit dollar. The calendar's dollar stays
// honest-blank until a statement is uploaded (Epic G). No dollar is computed or carried here. A row
// with no true-up month is simply not placed (it is countable upstream as "no month on file", never a
// guessed month, never a fabricated zero count).

/**
 * One true-up entry: a meter or array carrying a settle month (1-12). Rows with a null/out-of-range
 * month are excluded UPSTREAM (the dataset only feeds entries that carry a real month), so the
 * function trusts every entry's month and additionally guards the [1,12] range to fail closed.
 */
export type TrueUpEntryInput = {
  /** The meter or array id (carried through so a caller can trace a cell back to its rows). */
  id: string;
  /** Whether this entry is a meter or an array (cells carry both counts separately). */
  kind: "meter" | "array";
  /** Annual settle month, 1-12. Out-of-range entries are ignored (honest, never guessed). */
  trueUpMonth: number;
};

/** One month cell on the rolling grid, with the count of meters and arrays settling that month. */
export type TrueUpMonthCell = {
  /** The calendar month this cell represents, 1-12. */
  month: number;
  /** How many meters settle this month. */
  meterCount: number;
  /** How many arrays settle this month. */
  arrayCount: number;
};

/** The assembled true-up calendar across the fleet, relative to an injected current month. */
export type TrueUpCalendar = {
  /**
   * Twelve cells rolling forward from `todayMonth` inclusive (FR13): cells[0] is `todayMonth`,
   * cells[11] is eleven months ahead. Each carries its meter and array settling counts.
   */
  cells: TrueUpMonthCell[];
  /**
   * The nearest upcoming month within the next twelve (the earliest populated month from `todayMonth`
   * forward), with its meter count and whole-months-ahead (0 = settling this month). Null when no
   * meter has a true-up month on file - honest absence, never a fabricated date.
   */
  nextUpcoming: { month: number; meterCount: number; monthsAhead: number } | null;
};

/** A month is valid only as an integer in [1,12]; anything else is ignored (honest, never guessed). */
function isMonth(m: number): boolean {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}

/**
 * FR12/FR13. Places each entry's `trueUpMonth` on a twelve-month grid rolling forward from
 * `todayMonth` (an injected 1-12, never read from a clock). cells[0] is `todayMonth`; cells[i] is
 * i whole months ahead (wrapping 12 -> 1). Each cell carries its meter and array settling counts.
 * The `nextUpcoming` is the earliest populated month within the window with its meter count and
 * `monthsAhead` (0 = this month). An entry with an out-of-range month is not placed. An out-of-range
 * `todayMonth` yields twelve empty cells and a null next-upcoming (fail closed, never a guess). Pure;
 * no dollar (the calendar's dollar is honest-blank, FR14).
 */
export function buildTrueUpCalendar(
  entries: TrueUpEntryInput[],
  todayMonth: number,
): TrueUpCalendar {
  // Twelve cells rolling forward from todayMonth inclusive. Out-of-range today => empty grid.
  const validToday = isMonth(todayMonth);
  const cells: TrueUpMonthCell[] = [];
  for (let ahead = 0; ahead < 12; ahead += 1) {
    const month = validToday ? ((todayMonth - 1 + ahead) % 12) + 1 : ahead + 1;
    cells.push({ month, meterCount: 0, arrayCount: 0 });
  }

  if (!validToday) {
    // No anchor month to roll from: place nothing, name no next-upcoming. Honest, never a guess.
    return { cells, nextUpcoming: null };
  }

  // Tally each entry into its cell. monthsAhead is the whole-month distance forward from today,
  // 0-11 (0 = settling this month); a cell at that distance always exists in the rolling grid.
  for (const entry of entries) {
    if (!isMonth(entry.trueUpMonth)) continue;
    const ahead = (entry.trueUpMonth - todayMonth + 12) % 12;
    const cell = cells[ahead];
    if (!cell) continue; // unreachable (ahead is always 0-11), but guards noUncheckedIndexedAccess
    if (entry.kind === "meter") cell.meterCount += 1;
    else cell.arrayCount += 1;
  }

  // The next-upcoming is the earliest cell (from today forward) any METER settles, with its count.
  // Arrays alone do not define the next-upcoming pull-out (the lead line counts meters, FR13).
  let nextUpcoming: TrueUpCalendar["nextUpcoming"] = null;
  for (let ahead = 0; ahead < 12; ahead += 1) {
    const cell = cells[ahead];
    if (cell && cell.meterCount > 0) {
      nextUpcoming = { month: cell.month, meterCount: cell.meterCount, monthsAhead: ahead };
      break;
    }
  }

  return { cells, nextUpcoming };
}
