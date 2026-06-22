// The bill-dispute agent's PURE selection step. Given a farm's pending Recommendation
// rows, pick the ones worth drafting a PG&E dispute letter for: an "act"-severity
// bill-audit finding whose dollar excess clears a floor. The engines (runEngines, via
// billAudit) already produced these rows and OWN every number; this module never
// recomputes a dollar — it only READS the stored action JSON defensively (mirroring the
// readAction narrowing in src/lib/dashboard/findings.ts) and decides which findings the
// agent escalates.
//
// We deliberately do NOT escalate the no-peak "watch" findings (the engine emits bill
// audits as "act"; a future "watch" variant must not auto-draft a dispute). And we attach
// a STABLE dedupe key (pumpId + cycleStart) because runEngines clears and re-inserts the
// farm's pending engine recs on every sweep, so a finding's Recommendation id changes
// across sweeps but its (meter, cycle) identity does not — the agent dedupes on that
// identity so a daily re-run never re-proposes the same cycle.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in detect.test.ts.

/** Below this dollar excess a flagged cycle is not worth a formal dispute letter. The
 *  engine already gates on a 25% over-median jump; this is a second, absolute floor so a
 *  small-meter cycle that clears the ratio but is only a few dollars over does not become a
 *  dispute packet. ~$50, the same order as the product's "bankable" threshold. */
export const DISPUTE_FLOOR_USD = 50;

/** The least a stored Recommendation row needs for the dispute selection. Structural over
 *  the Prisma row (the pure step never imports Prisma types); `action` is the Json column
 *  and arrives as `unknown`, narrowed defensively below. */
export type AuditCandidateRow = {
  id: string;
  action: unknown;
  severity: string;
  status: string;
};

/** A finding the agent will draft a dispute for: the source recommendation id, the dollars
 *  the engine computed, the cycle window, and the STABLE dedupe key. Every figure is read
 *  off the stored action.params (engine-authored), never recomputed here. */
export type DisputeCandidate = {
  /** The source Recommendation id (links the proposed action to the finding). */
  recommendationId: string;
  /** The meter the cycle belongs to (action.params.pumpId). */
  pumpId: string;
  /** The flagged cycle's start, ISO 8601 (action.params.cycleStart). */
  cycleStart: string;
  /** The flagged cycle's close, ISO 8601, or null when the row did not carry it. */
  cycleClose: string | null;
  /** What the cycle billed (action.params.totalBillUsd), float dollars as stored. */
  totalBillUsd: number;
  /** The meter's usual comparable-cycle median (action.params.medianTotalUsd). */
  medianTotalUsd: number;
  /** The dollar excess over the median (action.params.excessUsd) — the dispute amount. */
  excessUsd: number;
  /** The stable identity across runEngines sweeps: pumpId + cycleStart. The agent dedupes
   *  proposed actions on this, never on the (re-inserted) recommendation id. */
  dedupeKey: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A finite number, else null (a NaN / non-number stored value is no value). */
function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A non-empty trimmed string, else null. */
function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** The stable dedupe key for a (meter, cycle) pair. Exported so run.ts builds the SAME key
 *  when it reads existing proposed actions' proposedCommand back (both sides must agree). */
export function disputeDedupeKey(pumpId: string, cycleStart: string): string {
  return `${pumpId}::${cycleStart}`;
}

/**
 * Narrow ONE stored bill-audit recommendation to a DisputeCandidate, or null when it is not
 * a disputable finding. A row qualifies only when ALL hold:
 *  - the stored action.kind is "audit_bill" (the engine's machine verb for a bill audit);
 *  - severity is "act" (never the no-peak "watch" findings);
 *  - status is "pending" (only an open finding is disputed; defense in depth — the loader
 *    already queries pending rows);
 *  - action.params carries a readable pumpId + cycleStart;
 *  - the engine-computed excessUsd is a positive number above DISPUTE_FLOOR_USD.
 * Every dollar is READ from action.params, never recomputed — the engine owns the numbers.
 */
export function readDisputeCandidate(row: AuditCandidateRow): DisputeCandidate | null {
  if (row.severity !== "act") return null;
  if (row.status !== "pending") return null;
  if (!isObject(row.action)) return null;
  if (row.action.kind !== "audit_bill") return null;

  const params = isObject(row.action.params) ? row.action.params : null;
  if (params === null) return null;

  const pumpId = nonEmpty(params.pumpId);
  const cycleStart = nonEmpty(params.cycleStart);
  if (pumpId === null || cycleStart === null) return null;

  const excessUsd = finiteNumber(params.excessUsd);
  if (excessUsd === null || excessUsd <= DISPUTE_FLOOR_USD) return null;

  // totalBillUsd / medianTotalUsd back the letter's figures; fall back to a derived value
  // only as a last resort so a malformed row still drafts an honest letter rather than
  // being dropped. The engine writes all three together, so this fallback rarely fires.
  const totalBillUsd = finiteNumber(params.totalBillUsd);
  const medianTotalUsd = finiteNumber(params.medianTotalUsd);

  return {
    recommendationId: row.id,
    pumpId,
    cycleStart,
    cycleClose: nonEmpty(params.cycleClose),
    totalBillUsd: totalBillUsd ?? (medianTotalUsd !== null ? medianTotalUsd + excessUsd : excessUsd),
    medianTotalUsd: medianTotalUsd ?? (totalBillUsd !== null ? totalBillUsd - excessUsd : 0),
    excessUsd,
    dedupeKey: disputeDedupeKey(pumpId, cycleStart),
  };
}

/**
 * Select every disputable finding from the farm's pending rows. Pure projection: maps each
 * row through readDisputeCandidate and drops the nulls. De-duplicates on the stable key so
 * a single sweep that somehow carried two rows for the same (meter, cycle) yields one
 * candidate (first wins), keeping the agent's proposal idempotent within a run as well as
 * across runs.
 */
export function detect(rows: readonly AuditCandidateRow[]): DisputeCandidate[] {
  const seen = new Set<string>();
  const out: DisputeCandidate[] = [];
  for (const row of rows) {
    const candidate = readDisputeCandidate(row);
    if (candidate === null) continue;
    if (seen.has(candidate.dedupeKey)) continue;
    seen.add(candidate.dedupeKey);
    out.push(candidate);
  }
  return out;
}
