// Pure display-layer checks for Almond Logic runs. Turnout on a run is SOURCE-PROVIDED (r.turnout from
// the portal), not computed by Terra; when a run ALSO reports bin + load weight we can independently
// check it (turnout should equal binWeight / loadWeight * 100). When the two disagree beyond a small
// tolerance the row is FLAGGED rather than presenting a turnout we can't stand behind (the run-745
// defect). These functions never mutate or invent a number — they only format and flag.

/** Format a source turnout percent to one decimal, or a dash when absent (fixes "8.6351596%"). */
export function formatTurnoutPct(value: number | null): string {
  if (value == null) return "-";
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Turnout implied by the two weights (huller bin / field load * 100), or null when either is missing
 *  or the load weight is non-positive (no honest ratio). */
export function computedTurnoutPct(
  binWeight: number | null,
  loadWeight: number | null,
): number | null {
  if (binWeight == null || loadWeight == null || loadWeight <= 0) return null;
  return (binWeight / loadWeight) * 100;
}

/** Whole-percentage-point tolerance for the source-vs-computed turnout check. */
export const TURNOUT_TOLERANCE_PCT = 1;

/**
 * True when the source turnout and the weight-implied turnout disagree beyond tolerance — the row's
 * sources contradict each other and the turnout should be flagged, not trusted. Returns false when
 * either input is absent (nothing to check against), so a run that simply lacks weights is never
 * flagged.
 */
export function turnoutMismatch(
  binWeight: number | null,
  loadWeight: number | null,
  turnout: number | null,
): boolean {
  const computed = computedTurnoutPct(binWeight, loadWeight);
  if (computed == null || turnout == null) return false;
  return Math.abs(computed - turnout) > TURNOUT_TOLERANCE_PCT;
}
