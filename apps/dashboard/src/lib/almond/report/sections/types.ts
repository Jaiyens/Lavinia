// The grounded-data prop shapes every PDF section template consumes (Story 9.1). A section renders
// ONLY what it is handed in one of these shapes; it never derives a dollar figure, never reads a
// clock or Prisma, and never accepts a model-authored value. The deterministic caller (a later Epic
// 9 story) authors every field from the uncapped full-data loader (Story 8.1) and the pure rate
// lever, exactly as the spreadsheet path does, so the PDF and the spreadsheet can never disagree.
//
// Money is carried as integer cents (AR-6), so the section formats it through the shared formatUsd at
// render time and never hand-formats a dollar string. A value that is not on file is `null` (a meter
// with no loaded billing, a field the grower has not captured); the section turns a null into a
// coverage LABEL, never a fabricated or zero figure. Pure types: no React, no I/O.

import type { CoverageState } from "@/lib/recommendations/types";

/** The farm-summary section's grounded input: a few measured counts and the loaded spend. */
export type SummarySectionData = {
  farmName: string;
  /** Total meters on file (the coverage denominator). */
  totalMeters: number;
  /** Meters carrying loaded (reconciled) billing. */
  reconciledMeters: number;
  /** Whole-percent complete, floored (from the shared coverage composer). */
  coveragePercent: number;
  /** Summed this-cycle spend across reconciled meters, integer cents; null when none is loaded. */
  loadedSpendCents: number | null;
};

/** One mis-rated meter: billed on a rate that the rate review suggests is wrong. The suggested rate
 *  is a grounded string from the lever (e.g. "AG-B"), never a model claim; null when the lever has no
 *  suggestion to show. No dollars here - the savings section owns the money. */
export type MisRatedRow = {
  meterName: string;
  ranch: string | null;
  currentRate: string | null;
  suggestedRate: string | null;
};

/** The mis-rated section's grounded input: the focused set, in the caller's order (no cap). An empty
 *  array renders the honest "nothing flagged" line, never an empty table. */
export type MisRatedSectionData = {
  rows: readonly MisRatedRow[];
};

/** One meter's estimated savings from a rate change, integer cents (AR-6). `from`/`to` are the
 *  grounded rate codes; `savingsCents` is the lever's estimate. */
export type SavingsRow = {
  meterName: string;
  from: string | null;
  to: string | null;
  savingsCents: number;
};

/** The savings section's grounded input: per-meter savings and the summed total (also in cents, so
 *  the section formats it once through formatUsd). An empty array renders the honest empty line. */
export type SavingsSectionData = {
  rows: readonly SavingsRow[];
  totalSavingsCents: number;
};

/** The single-meter section's grounded input: one meter's detail for a single-pump report. Money is
 *  integer cents or null; a null money field with a non-reconciled coverage state renders the
 *  coverage label, a null inventory field renders "Not on file" - never a fabricated value. */
export type SingleMeterSectionData = {
  name: string;
  ranch: string | null;
  entity: string | null;
  rate: string | null;
  status: string | null;
  coverageState: CoverageState;
  /** This-cycle cost in integer cents; null unless reconciled (carries a value). */
  costCents: number | null;
  /** Demand charge in integer cents; null when none, or unreconciled. */
  demandCents: number | null;
};
