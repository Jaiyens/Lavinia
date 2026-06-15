// The findings read edge (Story 3.1, FR-13). Projects the dashboard farm's pending
// Recommendation rows into a plain FindingView[] that the findings rail, the mobile
// sheet, and the meter drawer all read. The mapping is pure (tested below the same way
// as table.ts/map.ts); the DB edge takes an explicit PrismaClient. A finding with no
// dollar impact and no impact note is dropped HERE, never in JSX (the AC5 visibility
// law lives in one tested place).

import type { PrismaClient } from "@prisma/client";
import { compareFindings } from "@/lib/recommendations/top-finding";
import type { RecStatus, Severity } from "@/lib/recommendations/types";

/** The least a stored Recommendation row needs to become a FindingView. Structural over
 *  the Prisma row so the pure mapping never imports Prisma types. `action`/`result` are
 *  Json columns and arrive as `unknown`; they are narrowed defensively (a malformed row
 *  renders with honest fallbacks, never throws the rail down). */
export type FindingRow = {
  id: string;
  situation: string;
  action: unknown;
  impactUsd: number | null;
  impactNote: string | null;
  severity: string;
  status: string;
  result: unknown;
};

export type FindingView = {
  id: string;
  situation: string;
  /** The action's farmer-facing label; null when the stored action is unreadable
   *  (the card renders the /copy fallback, never a blank). */
  actionLabel: string | null;
  /** Legacy float DOLLARS as stored on the row (not cents); render via the shared
   *  formatter rounded to whole dollars, never cent precision. */
  impactUsd: number | null;
  impactNote: string | null;
  severity: Severity;
  status: RecStatus;
  /** The Pump cuid from action.params.pumpId (what the nuqs `meter` key holds);
   *  null when the finding is fleet-level or the action is unreadable. */
  meterId: string | null;
  /** Resolved from the farm's meters when meterId matches; null otherwise. */
  meterName: string | null;
  /** The result's note once Epic 4 closes the loop; null until then. */
  resultNote: string | null;
};

const SEVERITIES: readonly string[] = ["info", "watch", "act"];
const STATUSES: readonly string[] = ["pending", "done", "dismissed", "overridden"];

function toSeverity(s: string): Severity {
  return SEVERITIES.includes(s) ? (s as Severity) : "info";
}
// Fail CLOSED: an unrecognized stored status must not resurrect a row as actionable
// "pending" (severity's "info" fallback fails safe; the symmetric default here would
// fail open). loadFindings only queries pending rows, so this is defense in depth.
function toStatus(s: string): RecStatus {
  return STATUSES.includes(s) ? (s as RecStatus) : "dismissed";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A non-empty trimmed string, else null (a whitespace impactNote is no impact note). */
function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Narrow the stored action Json to its displayable parts. */
function readAction(action: unknown): { label: string | null; meterId: string | null } {
  if (!isObject(action)) return { label: null, meterId: null };
  const label = nonEmpty(action.label);
  const params = isObject(action.params) ? action.params : null;
  const meterId = params !== null ? nonEmpty(params.pumpId) : null;
  return { label, meterId };
}

/** Narrow the stored result Json to the note v1 renders (4.2 owns the full diff). */
function readResultNote(result: unknown): string | null {
  if (!isObject(result)) return null;
  return nonEmpty(result.note);
}

/**
 * Map stored rows to the view shape: drop no-impact findings (AC5), resolve the meter
 * linkage and name, and sort with the shared comparator (severity, then dollars).
 */
export function toFindingViews(
  rows: readonly FindingRow[],
  meters: readonly { id: string; name: string }[],
): FindingView[] {
  const names = new Map(meters.map((m) => [m.id, m.name]));
  return rows
    .map((row): FindingView | null => {
      const impactNote = nonEmpty(row.impactNote);
      const impactUsd = row.impactUsd;
      // AC5: a finding with no dollar impact and no impact note is not shown.
      if (impactUsd === null && impactNote === null) return null;
      // A finding with no situation has no story to tell; drop it rather than render
      // a card with a blank narrative line (same honesty law as the impact filter).
      const situation = nonEmpty(row.situation);
      if (situation === null) return null;
      const { label, meterId } = readAction(row.action);
      return {
        id: row.id,
        situation,
        actionLabel: label,
        impactUsd,
        impactNote,
        severity: toSeverity(row.severity),
        status: toStatus(row.status),
        meterId,
        meterName: meterId !== null ? (names.get(meterId) ?? null) : null,
        resultNote: readResultNote(row.result),
      };
    })
    .filter((f): f is FindingView => f !== null)
    .sort(compareFindings);
}

/** Sum of the visible findings' POSITIVE dollar impacts (float dollars), for the sheet
 *  summary. Negative impacts (a credit-shaped finding) still show on their own card but
 *  must not deflate the "dollars at stake" figure. */
export function findingsAtRiskUsd(findings: readonly FindingView[]): number {
  return findings.reduce((sum, f) => sum + Math.max(0, f.impactUsd ?? 0), 0);
}

/** Load the farm's pending findings as the view shape. Takes an explicit PrismaClient. */
export async function loadFindings(
  prisma: PrismaClient,
  farmId: string,
): Promise<FindingView[]> {
  const [rows, pumps] = await Promise.all([
    prisma.recommendation.findMany({
      where: { farmId, status: "pending" },
      // Not the display order (toFindingViews re-sorts by severity then dollars); this
      // survives only as the stable-sort tiebreaker for equal-severity, equal-impact rows.
      orderBy: { createdAt: "asc" },
    }),
    prisma.pump.findMany({ where: { farmId }, select: { id: true, name: true } }),
  ]);
  return toFindingViews(rows, pumps);
}
