// The ONE coverage / as-of footer composer for every file Almond hands a grower (Story 8.4). Every
// export carries an honest statement of how complete the data behind it is: which meters made it,
// what share carries loaded billing (stated plainly as a whole-percent complete, e.g. "82%
// complete"), and the freshest billed cycle on file (or its honest absence). This is the single
// source of coverage honesty: the 8.2 XLSX builder renders it now, and the Epic 9 PDF composer will
// render the SAME lines, so the two artifacts can never disagree about what is and is not covered.
//
// It is PURE and format-agnostic: it reads the coverage / as-of state the 8.1 loader travels with
// the rows (ExportCoverageState) and returns the footer as plain lines. The caller (XLSX rows, PDF
// blocks) lays them out; this module owns the WORDS. No clock, no fs, no external calls (CI law:
// answerable by the offline stub responder), so a missing value always reads as a coverage label,
// never a fabricated or zero figure. Copy lives in src/copy/en.ts; this only composes it. No em
// dashes, no exclamation marks, plain operator English.

import { en } from "@/copy/en";
import type { ExportCoverageState } from "./load";

const t = en.shell.almond.export;

// Format a posted-cycle close (a UTC-midnight ISO 8601 string from the 8.1 loader) as a plain date,
// in UTC so the printed day never shifts under the runner's timezone (a CI machine in another zone
// must print the same day as Vercel). Module-level so the formatter is built once.
const AS_OF_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * Whole-percent of meters that carry loaded (reconciled) billing - the "% complete" the footer
 * states. Floored to a whole number so a partial farm never rounds UP to imply more billing than is
 * on file (e.g. 149 of 183 reconciled is "81% complete", never 82%); an empty farm is 0, never a
 * divide-by-zero. The caller passes this to the copy so the wording and the math stay in one place.
 */
export function coveragePercent(state: ExportCoverageState): number {
  const { total, reconciled } = state.coverage;
  if (total === 0) return 0;
  return Math.floor((reconciled / total) * 100);
}

/**
 * The as-of line: the freshest BILLED cycle the farm has on file, formatted as a plain UTC date, or
 * the honest "no bills posted yet" line when the loader reports `asOf: null`. Never invents a date -
 * absence is a labeled line, not a fabricated or zero date (the export honesty law).
 */
export function asOfLine(asOf: string | null): string {
  return asOf === null ? t.asOfNone : t.asOf(AS_OF_FMT.format(new Date(asOf)));
}

/**
 * Compose the shared coverage / as-of footer for an export, as plain lines in display order:
 *   1. the coverage statement - every meter is included, what share carries loaded billing stated as
 *      a whole-percent complete (partial billing said plainly), and that the rest show a coverage
 *      label in place of a dollar figure (no silent truncation);
 *   2. the as-of - the freshest billed cycle on file, or its honest absence.
 *
 * The SINGLE source of coverage honesty: the 8.2 XLSX builder appends these below its table and the
 * Epic 9 PDF composer will print the same lines, so an artifact can never overstate its completeness.
 * Pure given the 8.1 loader's coverage / as-of state; the caller owns layout, this owns the words.
 */
export function composeCoverageFooter(state: ExportCoverageState): string[] {
  const { total, reconciled } = state.coverage;
  return [
    t.coverageFooter(total, reconciled, coveragePercent(state)),
    asOfLine(state.asOf),
  ];
}
