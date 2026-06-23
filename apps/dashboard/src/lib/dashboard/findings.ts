// The findings read edge (Story 3.1, FR-13). Projects the dashboard farm's pending
// Recommendation rows into a plain FindingView[] that the findings rail, the mobile
// sheet, and the meter drawer all read. The mapping is pure (tested below the same way
// as table.ts/map.ts); the DB edge takes an explicit PrismaClient. A finding with no
// dollar impact and no impact note is dropped HERE, never in JSX (the AC5 visibility
// law lives in one tested place).

import type { PrismaClient } from "@prisma/client";
import { compareFindings } from "@/lib/recommendations/top-finding";
import type { RecStatus, Severity } from "@/lib/recommendations/types";
import { SOLAR_TOOL } from "@/lib/energy/solar-nem";

/** The least a stored Recommendation row needs to become a FindingView. Structural over
 *  the Prisma row so the pure mapping never imports Prisma types. `action`/`result` are
 *  Json columns and arrive as `unknown`; they are narrowed defensively (a malformed row
 *  renders with honest fallbacks, never throws the rail down). */
export type FindingRow = {
  id: string;
  /** The engine tool that produced this row (e.g. "rate-optimization", "demand-charge"),
   *  so the UI can single out the rate-optimization finding for the Home "Rate Fix" hero. */
  tool: string;
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
  /** The engine tool that produced this finding (for the Rate Fix hero selector). */
  tool: string;
  situation: string;
  /** The action's farmer-facing label; null when the stored action is unreadable
   *  (the card renders the /copy fallback, never a blank). */
  actionLabel: string | null;
  /** The grounded machine verb off the stored action (action.kind, e.g. "switch_rate",
   *  "review_solar_demand", "track_trueup"); null when the action is unreadable. Read HERE
   *  (the single tested narrowing place) so a consumer discriminates on the persisted kind,
   *  never on severity or the farmer-facing label. Powers the G-2 billing-finding gate.
   *  Optional on the type (legacy literals predate it) but ALWAYS set by toFindingViews. */
  actionKind?: string | null;
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
  /** When the stored action is a rate switch (action.kind === "switch_rate"), the
   *  suggested rate code from action.params.toSchedule (e.g. "AG-C"), falling back to the
   *  legacy action.params.to; null for every other finding, and null when a switch finding
   *  has no readable target. Surfaced HERE (the single tested narrowing place) so a
   *  consumer reads the GROUNDED action kind off the stored JSON, never string-parses the
   *  farmer-facing label, whose copy ("Move it to AG-C") deliberately never contains the
   *  word "switch". The engine writes the target to params.toSchedule, so reading only
   *  params.to (the prior bug) left this null for every real finding. */
  rateSwitchTo: string | null;
  /** The meter's CURRENT rate the switch finding moves off of, from
   *  action.params.fromSchedule (falling back to action.params.from); null for every
   *  non-switch finding. Pairs with rateSwitchTo so a consumer can render "AG-B -> AG-C".
   *  Optional on the type (legacy literals predate it) but ALWAYS set by toFindingViews. */
  rateSwitchFrom?: string | null;
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

/** Narrow the stored action Json to its displayable parts plus the grounded rate-switch
 *  source/target and the machine action kind. The rate-switch target/source read off the machine
 *  verb (action.kind === "switch_rate") and action.params.{to,from}Schedule (the engine's actual
 *  keys; params.{to,from} are kept only as legacy fallbacks), NOT the farmer-facing label - the
 *  label copy ("Move it to AG-C") never contains the word "switch", so any label string-match
 *  misses every real finding. This is the single tested place the canonical suggested rate is
 *  derived, so the dashboard rail, the report, and analyzeFarm all agree. */
function readAction(action: unknown): {
  label: string | null;
  meterId: string | null;
  rateSwitchTo: string | null;
  rateSwitchFrom: string | null;
  actionKind: string | null;
} {
  if (!isObject(action)) {
    return { label: null, meterId: null, rateSwitchTo: null, rateSwitchFrom: null, actionKind: null };
  }
  const label = nonEmpty(action.label);
  const params = isObject(action.params) ? action.params : null;
  const meterId = params !== null ? nonEmpty(params.pumpId) : null;
  const actionKind = nonEmpty(action.kind);
  // The switch source/target come from params.{from,to}Schedule (the engine's keys);
  // params.{from,to} stay as legacy fallbacks so older fixtures/rows still read.
  const isSwitch = action.kind === "switch_rate" && params !== null;
  const rateSwitchTo =
    isSwitch && params !== null ? (nonEmpty(params.toSchedule) ?? nonEmpty(params.to)) : null;
  const rateSwitchFrom =
    isSwitch && params !== null
      ? (nonEmpty(params.fromSchedule) ?? nonEmpty(params.from))
      : null;
  return { label, meterId, rateSwitchTo, rateSwitchFrom, actionKind };
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
      const { label, meterId, rateSwitchTo, rateSwitchFrom, actionKind } = readAction(row.action);
      return {
        id: row.id,
        tool: row.tool,
        situation,
        actionLabel: label,
        actionKind,
        impactUsd,
        impactNote,
        severity: toSeverity(row.severity),
        status: toStatus(row.status),
        meterId,
        meterName: meterId !== null ? (names.get(meterId) ?? null) : null,
        rateSwitchTo,
        rateSwitchFrom,
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

/**
 * G-2 (FR23, UX-DR11) the honest-dollar separation guard, as a tested pure predicate. A solar
 * finding may carry exactly ONE honest dollar in its `impactNote`: the F2 demand-charge gap (a
 * charge already printed on the bill, money owed, not a net-metering credit). When that note
 * renders beside the Solar tab's honest-blank credit cells the card fronts it with the "On your
 * bill" chip so the layout can never be read as a composite "solar saved you X".
 *
 * The discriminator is the F2 SHAPE EXACTLY: `tool === SOLAR_TOOL` AND the grounded
 * `actionKind === "review_solar_demand"`. It is NOT `severity === "info"`: the legacy
 * `solarNemChecks` `track_trueup` emitter also persists a SOLAR_TOOL info finding (it still runs on
 * the demo/seed farm and the public Tour, B-1/ADR-S05), but its note is a NET-METERING true-up
 * message - stamping the billing chip over it would invert the very honesty contract this guard
 * exists to protect. Gating on the unique action kind excludes it, and excludes every watch-severity
 * solar finding (F1/F3) and every non-solar tool, by construction.
 */
export function isSolarBillingFinding(finding: FindingView): boolean {
  return finding.tool === SOLAR_TOOL && finding.actionKind === "review_solar_demand";
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
