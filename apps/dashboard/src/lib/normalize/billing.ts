// The charge-detail normalizer (Story 1.6): maps a raw PerSaChargeDetail page (the
// RawExtraction layer) into the integer-cents canonical bill shape, joining to inventory on
// a canonical SA ID and refusing to attach a figure to a meter whose identity does not check
// out. Pure: it takes the raw extraction plus an in-memory inventory projection and returns a
// plain CanonicalBill - no Prisma, no I/O, no UI. The DB read that builds the inventory view
// and the persistence of the canonical bill are Story 1.8; the cent-reconciliation gate that
// promotes a clean bill to "reconciled" is Story 1.7. A clean join rests at "no_bill" until
// then (the same resting state as the DB default and Story 1.5's NEM normalize).
//
// Identity-honest (AC3 / NFR-4): a PRESENT extracted meter # or Pump ID that disagrees with
// the inventory row joined on SA ID -> "needs_review", never attached to a possibly-wrong
// meter. An absent (null) extracted identifier cannot contradict, so it does not fail the
// join. An SA ID matching no inventory row (or a blank SA ID) is likewise "needs_review".
//
// As a raw-consuming mapper (it imports PerSaChargeDetail) this is ingestion-only and must
// never be imported by /app - the no-raw-source-in-ui guard forbids @/lib/normalize/billing.

import type { PerSaChargeDetail } from "@/lib/extract/schema";
import type { CoverageState } from "@/lib/recommendations/types";
import { normalizeSaId } from "./sa-id";
import type { CanonicalBill, CanonicalLineItem, CanonicalTouBucket } from "./types";

/** One inventory meter's identity fields, keyed by its canonical SA ID (Pump.serviceId). */
export type BillInventoryRow = {
  saId: string;
  meterSerial: string | null;
  growerPumpId: string | null;
};

/** The in-memory inventory the caller builds from the DB; this module never reads Prisma. */
export type BillInventoryView = { meters: BillInventoryRow[] };

/**
 * Normalize one raw per-SA charge-detail page into the canonical bill shape.
 *
 * - Builds integer-cents line items from every charge that composes the printed total (each
 *   TOU energy bucket, the demand charge when present, each NBC, each other line) so Story
 *   1.7 can reconcile their sum against `printedTotalCents`.
 * - Carries the printed service period as the canonical period start/close (never fabricated).
 * - Joins inventory on the descriptor-stripped canonical SA ID; the descriptor is preserved
 *   on `CanonicalBill.saIdDescriptor` (AC2). A disagreeing present meter#/Pump-ID, an SA ID
 *   matching no row, or a blank SA ID -> `coverageState "needs_review"`; otherwise "no_bill".
 */
export function normalizeBill(
  raw: PerSaChargeDetail,
  inventory: BillInventoryView,
): CanonicalBill {
  const { saId, descriptor } = normalizeSaId(raw.saId);

  const touSplit: CanonicalTouBucket[] = raw.touEnergy.map((bucket) => ({
    period: bucket.period,
    kWh: bucket.kWh,
    amountCents: bucket.amountCents,
  }));
  const isLegacyTou = raw.touEnergy.length === 3; // three-tier (Part-Peak) legacy AG-5

  // Every charge composing the printed total becomes a line item (the Story 1.7 reconcile
  // surface). Order: TOU energy, demand (when billed), NBCs, then other printed lines.
  const lineItems: CanonicalLineItem[] = [
    ...raw.touEnergy.map(
      (bucket): CanonicalLineItem => ({
        kind: "tou_energy",
        label: bucket.period,
        amountCents: bucket.amountCents,
        quantity: bucket.kWh,
        unit: "kWh",
        rate: bucket.rate,
      }),
    ),
    ...(raw.demandAmountCents !== null
      ? [
          {
            kind: "demand",
            label: null,
            amountCents: raw.demandAmountCents,
            quantity: raw.demandKw,
            unit: "kW",
            rate: null,
          } satisfies CanonicalLineItem,
        ]
      : []),
    ...raw.nbcLineItems.map(
      (line): CanonicalLineItem => ({
        kind: "nbc",
        label: line.label,
        amountCents: line.amountCents,
        quantity: null,
        unit: null,
        rate: null,
      }),
    ),
    ...raw.otherLineItems.map(
      (line): CanonicalLineItem => ({
        kind: "other",
        label: line.label,
        amountCents: line.amountCents,
        quantity: null,
        unit: null,
        rate: null,
      }),
    ),
  ];

  const coverageState = joinCoverage(saId, raw.meterNumber, raw.growerPumpId, inventory);

  return {
    saId,
    saIdDescriptor: descriptor,
    meterNumber: raw.meterNumber,
    growerPumpId: raw.growerPumpId,
    periods: [
      {
        saId,
        start: raw.serviceStart,
        close: raw.serviceEnd,
        cycleClose: raw.cycleClose,
        tariff: raw.rateName,
        isLegacyTou,
        touSplit,
        demandKw: raw.demandKw,
        demandAmountCents: raw.demandAmountCents,
        lineItems,
        printedTotalCents: raw.printedTotalCents,
        coverageState,
      },
    ],
  };
}

/** The identity-checked join verdict: needs_review unless the SA ID matches exactly one row
 *  that the present meter#/Pump-ID do not contradict. */
function joinCoverage(
  saId: string,
  meterNumber: string | null,
  growerPumpId: string | null,
  inventory: BillInventoryView,
): CoverageState {
  if (saId === "") return "needs_review"; // a blank SA ID can never identify a meter
  // Normalize BOTH sides to the canonical core: a grower's master sheet often carries a
  // descriptor in the SA-ID column (Pump.serviceId), so trimming the inventory side alone
  // would falsely reject a legitimate meter. Match on the descriptor-stripped core.
  const matches = inventory.meters.filter((meter) => normalizeSaId(meter.saId).saId === saId);
  // Exactly one row links; 0 (not found) or 2+ (ambiguous) is needs_review - never a guess.
  if (matches.length !== 1) return "needs_review";
  const row = matches[0]!;
  // A mismatch requires BOTH sides present and differing (trimmed). A null on either side is
  // missing data, not a contradiction, so it cannot fail the join (AC3 "do not match").
  const meterMismatch =
    meterNumber !== null &&
    row.meterSerial !== null &&
    meterNumber.trim() !== row.meterSerial.trim();
  const pumpIdMismatch =
    growerPumpId !== null &&
    row.growerPumpId !== null &&
    growerPumpId.trim() !== row.growerPumpId.trim();
  if (meterMismatch || pumpIdMismatch) return "needs_review";
  return "no_bill"; // clean attach, awaiting the Story 1.7 reconcile
}
