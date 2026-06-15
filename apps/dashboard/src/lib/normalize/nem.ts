// The NEM normalizer (Story 1.5): maps a raw NemReconciliation page (the RawExtraction
// layer) into the canonical NEM shape, links it to the generating SolarArray by SA ID,
// and names that array's benefiting meters by SA ID (the NEMA graph). Pure: it takes the
// raw extraction plus an in-memory inventory projection and returns a plain value - no
// Prisma, no I/O, no UI. The DB read that builds the inventory view and the persistence of
// the result live in the importer (Stories 1.6/1.8); this module stays provably testable.
//
// Identity-honest (AC3 / NFR-4): when the generating SA ID matches no array, it does NOT
// guess - arrayId is null and coverageState is "needs_review". NEM credits are never
// attached to a possibly-wrong array, mirroring the 1.6 meter#/Pump-ID mismatch rule.
//
// As a raw-consuming mapper (it imports NemReconciliation) this is ingestion-only and must
// never be imported by /app - the no-raw-source-in-ui guard forbids @/lib/normalize/nem.

import type { NemReconciliation } from "@/lib/extract/schema";
import { normalizeSaId } from "./sa-id";
import type { CanonicalNemMonth, CanonicalNemReconciliation } from "./types";

/** One array's NEMA projection: its generating SA ID and the SA IDs of its benefiting meters. */
export type NemArrayRow = {
  arrayId: string;
  arrayName: string | null;
  /** The array's own generating service SA ID (SolarArray.saId). */
  generatingSaId: string;
  /** The benefiting meters' SA IDs (SolarArray.benefitingMeters -> Pump.serviceId). */
  benefitingMeterSaIds: string[];
};

/** The in-memory inventory the caller builds from the DB; this module never reads Prisma. */
export type NemInventoryView = { arrays: NemArrayRow[] };

/**
 * Normalize one raw NEM reconciliation page into the canonical shape.
 *
 * - Maps every monthly row 1:1, in order, copying net kWh VERBATIM (negatives survive - AC2).
 * - Carries the annual true-up month, date, and amount straight through (AC1).
 * - Links the page to a SolarArray by trimmed-exact generating SA ID and names that array's
 *   benefiting meters (AC3). A unique match => coverageState "no_bill" (linked, awaiting the
 *   Story 1.7 reconcile). No match, or an ambiguous multi-match => arrayId null,
 *   benefitingMeterSaIds [], coverageState "needs_review" - never a fabricated link.
 */
export function normalizeNem(
  raw: NemReconciliation,
  inventory: NemInventoryView,
): CanonicalNemReconciliation {
  // Normalize to the canonical core SA ID (descriptor stripped), the SAME form both the
  // billing join and the importer's NEM inventory use - a NEM page prints "<id> <PumpID>",
  // so matching on the raw trimmed string would never link a descriptor-bearing SA.
  const generatingSaId = normalizeSaId(raw.saId).saId;

  const months: CanonicalNemMonth[] = raw.monthlyRows.map((row) => ({
    start: row.periodStart,
    close: row.periodEnd,
    netKwh: row.kWh, // verbatim: negative over-production months are never floored (AC2/FR-3)
    amountCents: row.amountCents,
  }));

  // A blank SA ID can never identify an array. The page schema accepts an empty saId and an
  // inventory projection may coerce a null SolarArray.saId to "", so without this guard two
  // blank keys would match and fabricate a link - the exact AC3 failure we forbid. Match on the
  // canonical core on BOTH sides so a descriptor-bearing inventory key still links.
  const matches =
    generatingSaId === ""
      ? []
      : inventory.arrays.filter((array) => normalizeSaId(array.generatingSaId).saId === generatingSaId);
  // A unique match links; no match or an ambiguous multi-match is needs_review (no guessing).
  const linked = matches.length === 1 ? matches[0]! : null;

  return {
    generatingSaId,
    arrayId: linked ? linked.arrayId : null,
    arrayName: linked ? linked.arrayName : null,
    trueUpMonth: raw.trueUpMonth,
    trueUpDate: raw.trueUpDate,
    trueUpAmountCents: raw.trueUpAmountCents,
    months,
    benefitingMeterSaIds: linked ? linked.benefitingMeterSaIds : [],
    coverageState: linked ? "no_bill" : "needs_review",
  };
}
