// Portal-shape health guards for the Almond Logic scrape (Phase 2). The portal has NO API contract
// and breaks silently when the site changes; the brief's hard rule is to raise a "source changed"
// alarm on such a break rather than write partial/garbage data. These are PURE functions over the
// enumerated portal response, so the decision to fail closed is deterministic and unit-tested — the
// side-effecting scrape wires them in and, on a raised alarm, records a failed run and writes NOTHING.
//
// Also home to the Sierra-Valley-Holding filter: the brief scopes yield ingestion to that ONE huller
// ("Ignore all other hullers"), and a run where SVH is absent from the grower's hullers is itself a
// source-changed signal (the grower's account shape changed, or the scrape hit the wrong account).

/** The huller shape the enumeration returns (getHullers.php). Only the fields the guards need. */
export type HullerRef = { id: number; name: string; cropYears: readonly number[] };

/** Why a scrape was refused as "source changed" — a stable, log-safe, non-secret reason code. */
export type SourceChangeReason =
  | "no_hullers_enumerated"
  | "sierra_valley_holding_missing"
  | "endpoint_error";

/**
 * Raised to abort a scrape when the portal's shape no longer matches what we parse. Carries a stable
 * reason code (never a secret) so the agent can record a redacted "source changed" run and alert,
 * instead of writing partial data. Distinct type so callers can tell a source change from any other
 * failure.
 */
export class SourceChangedError extends Error {
  readonly reason: SourceChangeReason;
  constructor(reason: SourceChangeReason, detail?: string) {
    super(`almond logic source changed: ${reason}${detail ? ` (${detail})` : ""}`);
    this.name = "SourceChangedError";
    this.reason = reason;
  }
}

/** Normalize a huller name for tolerant matching: trim, lowercase, collapse internal whitespace. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True when a huller name is Sierra Valley Holding (the one huller yield ingestion reads). Tolerant of
 * case, surrounding/'collapsed whitespace, and a trailing "s" ("Sierra Valley Holdings"), since the
 * portal's exact spelling is not a contract. Deliberately narrow otherwise: it must contain the whole
 * phrase, so an unrelated huller never matches.
 */
export function matchesSierraValleyHolding(name: string): boolean {
  const n = normalizeName(name);
  return n === "sierra valley holding" || n === "sierra valley holdings";
}

export type SvhSelection =
  | { ok: true; huller: HullerRef }
  | { ok: false; reason: "sierra_valley_holding_missing" };

/**
 * Select the Sierra Valley Holding huller from the grower's enumerated hullers. Returns it when found;
 * otherwise a source-changed signal (SVH absent => the account shape changed or we hit the wrong
 * account — never fall back to another huller, which would attribute the wrong yield). Pure: it
 * decides, the caller raises the alarm.
 */
export function selectSierraValleyHoller(hullers: readonly HullerRef[]): SvhSelection {
  const huller = hullers.find((h) => matchesSierraValleyHolding(h.name));
  if (!huller) return { ok: false, reason: "sierra_valley_holding_missing" };
  return { ok: true, huller };
}

/**
 * The account-level health check, run right after enumeration and BEFORE any write. Fails closed with
 * a SourceChangedError when:
 *   - a required account-level endpoint returned an error (the portal broke or the session died), or
 *   - no hullers were enumerated at all (an empty/omitted getHullers.php — a shape change), or
 *   - Sierra Valley Holding is not among the hullers (wrong account / renamed / removed).
 * Returns the selected SVH huller when healthy. Never writes; never logs a secret.
 */
export function assertPortalShape(
  hullers: readonly HullerRef[],
  endpointErrors: readonly string[],
): HullerRef {
  if (endpointErrors.length > 0) {
    throw new SourceChangedError("endpoint_error", endpointErrors.join(", "));
  }
  if (hullers.length === 0) {
    throw new SourceChangedError("no_hullers_enumerated");
  }
  const selection = selectSierraValleyHoller(hullers);
  if (!selection.ok) {
    throw new SourceChangedError(selection.reason);
  }
  return selection.huller;
}
