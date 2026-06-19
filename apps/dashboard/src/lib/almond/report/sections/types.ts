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

/** The cover section's grounded input: the single biggest opportunity (the analysis topFinding) and
 *  the two supporting farm totals. Every dollar field is integer cents (AR-6); the section formats
 *  through the shared formatUsd at render time. `hero` is null when no dollar opportunity is on file
 *  (the cover then states that plainly, never invents a hero figure). */
export type CoverSectionData = {
  farmName: string;
  /** The freshest billed cycle the figures reflect (a formatted human date), or null when no bill
   *  has posted (the cover states the absence honestly, never a fabricated date). */
  asOf: string | null;
  /** The single biggest opportunity (the analysis topFinding). Null when no dollar finding exists. */
  hero: {
    meterName: string;
    /** The estimated yearly impact in integer cents (the topFinding impactCents). */
    amountCents: number;
    /** The current rate when this is a rate switch (rateSwitchFrom); null otherwise. */
    currentRate: string | null;
    /** The suggested rate when this is a rate switch (rateSwitchTo); null otherwise. */
    suggestedRate: string | null;
    /** True when the biggest finding is a rate switch (carries a suggested rate). */
    isRateSwitch: boolean;
  } | null;
  /** Total loaded (reconciled) spend this cycle, integer cents; null when none is loaded. */
  totalSpendCents: number | null;
  /** Total demand charge this cycle, integer cents; null when none is on file. */
  totalDemandCents: number | null;
};

/** One ranked rate-switch opportunity: a meter the rate review suggests should move rates, with the
 *  current rate, the suggested rate, and the estimated yearly savings (integer cents, AR-6). */
export type OpportunityRow = {
  meterName: string;
  currentRate: string | null;
  suggestedRate: string | null;
  savingsCents: number;
};

/** The opportunities section's grounded input: the ranked rate-switch findings (most savings first)
 *  and their summed total, integer cents. An empty array renders the honest empty line. */
export type OpportunitiesSectionData = {
  rows: readonly OpportunityRow[];
  totalSavingsCents: number;
};

/** One bar in a native chart: a plain label and a non-negative magnitude. The magnitude is whatever
 *  the chart measures (integer cents for the money charts, a count for the rate-mix chart); the
 *  section scales the longest bar to full width and never invents a value. */
export type ChartBar = {
  label: string;
  /** The bar's magnitude in the chart's own unit (cents for money charts, a count for rate mix). */
  value: number;
  /** A preformatted value label drawn at the end of the bar (e.g. "$2,031.12" or "25"). */
  display: string;
};

/** The charts section's grounded input: three small bar charts, each a label and its bars (already
 *  sorted and capped by the caller). An empty bar list renders that chart's honest empty line. */
export type ChartsSectionData = {
  demandTop: readonly ChartBar[];
  spendByEntity: readonly ChartBar[];
  rateMix: readonly ChartBar[];
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
