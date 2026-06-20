// Pure derivation for the filter controls (Story 2.6): the distinct values each filter
// dimension can take on this farm. A dimension with no values renders no control (honest -
// never an empty dropdown). No DB, no UI.

import type { MeterView } from "./load";

export type FilterOptions = {
  entities: string[];
  ranches: string[];
  rates: string[];
  /** Distinct PG&E account numbers on this farm (A-7, FR1). Empty renders no account control. */
  accounts: string[];
  /** Distinct net-metering program tokens (MeterView.nemType) on this farm (A-7, FR1/UX5). On a
   *  non-solar farm this is empty, so the program control renders only where solar meters exist. */
  programs: string[];
};

function distinctSorted(values: (string | null)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed !== undefined && trimmed !== "") set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterOptions(meters: readonly MeterView[]): FilterOptions {
  return {
    entities: distinctSorted(meters.map((m) => m.entityName)),
    ranches: distinctSorted(meters.map((m) => m.ranchName)),
    rates: distinctSorted(meters.map((m) => m.rateSchedule)),
    accounts: distinctSorted(meters.map((m) => m.accountNumber)),
    programs: distinctSorted(meters.map((m) => m.nemType)),
  };
}
