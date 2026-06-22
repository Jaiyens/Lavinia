// The Home read edge for the bill-dispute card: load the farm's bill-dispute AgentActions and
// project them into the serializable BillDisputeCardView the client card renders, KEYED to the
// finding each one acts on so the Server Component can place a card beside the matching
// bill-audit finding. Farm-scoped at the query; the DB edge takes an explicit PrismaClient,
// and the mapping is pure (tested) so a malformed row renders honestly, never throws Home down.
//
// We surface only the ACTIONABLE/RESOLVED states a grower cares about on Home: a "proposed"
// action (the owner can approve) and an "executed" one (the packet is ready to download). A
// "rejected" (skipped) or a "failed" action is not re-surfaced on Home — the audit page is the
// full history; Home stays calm. The pump name + month + excess are read off the stored
// proposedCommand and the linked finding's engine-authored action.params, never recomputed.

import type { PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { reportDownloadHref } from "@/lib/almond/reports/view";
import { FILE_BILL_DISPUTE_KIND } from "./run";
import { readDisputeCandidate, type AuditCandidateRow } from "./detect";
import { disputeMonthLabel } from "./draft";

/** The statuses the Home card surfaces (proposed = owner can act; executed = packet ready). */
const HOME_STATUSES: readonly string[] = ["proposed", "executed"];

/** The serializable view the client card consumes. Mirrors BillDisputeCardView in the .tsx
 *  (kept here so the loader and the card agree without the loader importing a client module). */
export type BillDisputeCardView = {
  agentActionId: string;
  status: "proposed" | "approved" | "rejected" | "executed" | "failed";
  pumpName: string;
  month: string;
  excessUsd: number;
  downloadHref: string | null;
  /** The Recommendation id this dispute acts on, so the Server Component places the card next
   *  to the matching finding. Null when the link was cleared (the finding was deleted). */
  recommendationId: string | null;
};

/** Structural shape of the rows the loader maps (over the Prisma row, so the mapping never
 *  imports Prisma types). */
export type BillDisputeActionRow = {
  id: string;
  status: string;
  reportId: string | null;
  recommendationId: string | null;
  proposedCommand: unknown;
  recommendation: {
    id: string;
    action: unknown;
    severity: string;
    status: string;
  } | null;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asCardStatus(s: string): BillDisputeCardView["status"] {
  switch (s) {
    case "proposed":
    case "approved":
    case "rejected":
    case "executed":
    case "failed":
      return s;
    default:
      return "proposed";
  }
}

/**
 * Map ONE bill-dispute action row to a card view, or null when it should not show on Home (a
 * non-surfaced status, or an unreadable row). The pump name + cycle come from the LINKED finding
 * (engine-authored) when present; we read excess/cycleStart off it via the same readDisputeCandidate
 * narrowing the agent used, so the figures match the finding exactly. Pumps map: id -> name.
 */
export function toBillDisputeCardView(
  row: BillDisputeActionRow,
  pumpNames: ReadonlyMap<string, string>,
): BillDisputeCardView | null {
  if (!HOME_STATUSES.includes(row.status)) return null;

  // Prefer the grounded finding (its engine-authored action.params); fall back to the stored
  // proposedCommand for the meter/cycle when the finding link was cleared.
  let pumpId: string | null = null;
  let cycleStart: string | null = null;
  let excessUsd = 0;

  if (row.recommendation !== null) {
    const candidate = readDisputeCandidate(row.recommendation as AuditCandidateRow);
    if (candidate !== null) {
      pumpId = candidate.pumpId;
      cycleStart = candidate.cycleStart;
      excessUsd = candidate.excessUsd;
    }
  }
  if ((pumpId === null || cycleStart === null) && isObject(row.proposedCommand)) {
    const c = row.proposedCommand;
    if (typeof c.pumpId === "string") pumpId = c.pumpId;
    if (typeof c.cycleStart === "string") cycleStart = c.cycleStart;
  }
  if (pumpId === null || cycleStart === null) return null;

  const pumpName = pumpNames.get(pumpId) ?? pumpId;
  return {
    agentActionId: row.id,
    status: asCardStatus(row.status),
    pumpName,
    month: disputeMonthLabel(cycleStart),
    excessUsd,
    downloadHref: row.reportId !== null ? reportDownloadHref(row.reportId) : null,
    recommendationId: row.recommendationId,
  };
}

/** Map a set of action rows to card views, dropping the ones that should not surface on Home. */
export function toBillDisputeCardViews(
  rows: readonly BillDisputeActionRow[],
  pumpNames: ReadonlyMap<string, string>,
): BillDisputeCardView[] {
  return rows
    .map((row) => toBillDisputeCardView(row, pumpNames))
    .filter((v): v is BillDisputeCardView => v !== null);
}

/**
 * Load the farm's surfacing bill-dispute card views. FARM-SCOPED at the query: only this farm's
 * file_bill_dispute actions, joined to their (own-farm) source findings, with the farm's pump
 * names resolved for the headings. Read-only. Returns newest first so the freshest proposal/packet
 * shows first when more than one is open.
 */
export async function loadBillDisputeCards(
  prisma: PrismaClient,
  farmId: string,
): Promise<BillDisputeCardView[]> {
  const [rows, pumps] = await Promise.all([
    prisma.agentAction.findMany({
      where: { farmId, kind: FILE_BILL_DISPUTE_KIND, status: { in: HOME_STATUSES as string[] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reportId: true,
        recommendationId: true,
        proposedCommand: true,
        recommendation: { select: { id: true, action: true, severity: true, status: true } },
      },
    }),
    prisma.pump.findMany({ where: { farmId }, select: { id: true, name: true } }),
  ]);
  const pumpNames = new Map(pumps.map((p) => [p.id, p.name]));
  return toBillDisputeCardViews(rows as BillDisputeActionRow[], pumpNames);
}

// Keep a stable copy id reference so a future label change lands here, not scattered.
export const billDisputeCardCopy = en.agents.billDispute.card;
