// Pure derivation for the meter drawer (Story 2.5): project one canonical MeterView into the
// render model the drawer component displays. The AR-15 coverage gate lives HERE, inside the
// pure function, so the component cannot leak an ungated dollar figure: a meter that is not
// reconciled yields NO billing figures (latest = null, history = []), only its inventory and
// coverage state. No DB, no UI, no copy - labels stay nullable and the component maps absence
// to grower language.

import { drEnrollment, type DrProgram } from "@/lib/energy/dr";
import { verifyBill, type BillVerification } from "@/lib/energy/bill-verify";
import {
  summarizeNemMonths,
  type NemEnergyPosition,
} from "@/lib/energy/solar-nem";
import type { RateCard } from "@/lib/energy/rates";
import type { MeterView } from "./load";

export type DrawerTouRow = {
  /** The printed TOU period label as extracted (e.g. "Peak", "Off-Peak"); null when unlabeled. */
  label: string | null;
  /** kWh for the period; null when the bill did not print a quantity. */
  kwh: number | null;
  amountCents: number;
};

export type DrawerLineRow = {
  label: string | null;
  amountCents: number;
};

export type DrawerLatest = {
  /** ISO 8601 period bounds. */
  start: string;
  close: string;
  /** The period's printed rate, falling back to the inventory rate schedule. */
  tariff: string | null;
  touRows: DrawerTouRow[];
  /** null = no demand charge this cycle (honest absence, renders "None"). */
  demandCents: number | null;
  peakKw: number | null;
  /** Non-TOU, non-demand line items (NBCs, customer charge, taxes, ...). */
  otherRows: DrawerLineRow[];
  totalCents: number | null;
};

export type DrawerHistoryRow = {
  /** ISO 8601 close date. */
  close: string;
  totalCents: number;
};

export type DrawerSolar = {
  nemType: string | null;
  /** NEM annual settle month (1-12); null when not on file. */
  trueUpMonth: number | null;
  /** Paired array nameplate kW carried on the meter; null when not on file. */
  solarKw: number | null;
  arrays: { id: string; name: string | null; nameplateKw: number }[];
  /** Energy position from the printed NEM months; null when none on file (Story 3.4). */
  position: NemEnergyPosition | null;
  /** Summed printed NEM charges, integer cents; null when no months on file. */
  nemChargesCents: number | null;
  /** Printed annual true-up amount, integer cents; null when not on file. */
  trueUpAmountCents: number | null;
  /** Demand charge across reconciled cycles, integer cents; null when not
   *  quotable (unreconciled) or no demand was billed. Solar never reduces it. */
  demandOwedCents: number | null;
};

export type DrawerDetail = {
  /** True only for a reconciled meter; everything money-bearing is gated on it. */
  isCovered: boolean;
  /** DR program enrollment as the LATEST bill prints it (Story 3.7); null when
   *  the latest bill prints nothing. Latest-only deliberately: enrollment is a
   *  current-state fact, and an event credit on an old bill must not present a
   *  since-cancelled program as current. A printed enrollment line is a FACT,
   *  not a dollar claim, so it is not gated on reconciliation - the cent gate
   *  protects figures, not facts. */
  drProgram: DrProgram | null;
  /** The latest period's billing detail; null when withheld (unreconciled) or no period. */
  latest: DrawerLatest | null;
  /** Prior reconciled periods, newest first; empty until >=2 periods exist (never faked). */
  history: DrawerHistoryRow[];
  /** The solar section renders only when the meter is solar-flagged or carries a NEM program. */
  showSolar: boolean;
  solar: DrawerSolar;
};

/**
 * Bill-accuracy verification for the meter's LATEST bill (Story 4.1, FR-19): the
 * datum behind the drawer's verification badge. Pure - the fs-backed RateCard is
 * passed in (the server component loads it once and derives this map before it
 * reaches the client; the card never crosses to the client).
 *
 * Fails closed, silently, returning null when the bill cannot be honestly checked:
 *   - solar / NEM meters: their monthly charge pages omit the energy that settles
 *     at true-up, so a recompute from them would mislead - the SAME exclusion and
 *     reason run-rate-lever.ts applies before pricing (meter.isSolar || solarKw).
 *   - unreconciled meters: the AR-15 gate - no trusted figures exist (mirrors
 *     toDrawerDetail's own gate).
 *   - no periods on file: nothing to verify.
 * Beyond these, verifyBill itself returns null for an unmapped schedule or an
 * excluded cycle. A null result and a `verified: false` result both render nothing;
 * the component never implies PG&E mis-billed.
 *
 * Latest period only (matches toDrawerDetail's `latest` selection): the badge
 * verifies the bill on screen, not history. The schedule label is the meter's
 * stored rateSchedule - the exact input run-rate-lever.ts maps - so the badge and
 * the rate lever can never disagree about this meter's recompute (the FR-14
 * licensing relationship).
 */
export function verificationFor(
  meter: MeterView,
  card: RateCard,
): BillVerification | null {
  if (meter.isSolar || meter.solarKw !== null) return null;
  if (meter.coverageState !== "reconciled") return null;
  const latest = meter.periods[meter.periods.length - 1];
  if (latest === undefined) return null;
  return verifyBill({ scheduleLabel: meter.rateSchedule, period: latest }, card);
}

export function toDrawerDetail(meter: MeterView): DrawerDetail {
  const isCovered = meter.coverageState === "reconciled";

  let latest: DrawerLatest | null = null;
  let history: DrawerHistoryRow[] = [];

  // The coverage gate: an unreconciled meter yields no billing figures at all (AR-15).
  if (isCovered && meter.periods.length > 0) {
    const last = meter.periods[meter.periods.length - 1];
    if (last !== undefined) {
      latest = {
        start: last.start,
        close: last.close,
        tariff: last.tariff ?? meter.rateSchedule,
        touRows: last.lineItems
          .filter((li) => li.kind === "tou_energy")
          .map((li) => ({
            label: li.label,
            // The quantity is presented as kWh, so only carry it when the unit says kWh -
            // a kW or unitless quantity must not render under a fabricated unit.
            kwh: li.unit === "kWh" ? li.quantity : null,
            amountCents: li.amountCents,
          })),
        demandCents: last.demandCents,
        peakKw: last.peakKw,
        otherRows: last.lineItems
          .filter((li) => li.kind !== "tou_energy" && li.kind !== "demand")
          .map((li) => ({ label: li.label, amountCents: li.amountCents })),
        totalCents: last.printedTotalCents,
      };
    }

    // Prior periods, newest first, reconciled totals only (a null total is never listed).
    history = meter.periods
      .slice(0, -1)
      .flatMap((p) =>
        p.printedTotalCents !== null ? [{ close: p.close, totalCents: p.printedTotalCents }] : [],
      )
      .reverse();
  }

  // Story 3.4: the printed NEM facts. Position/charges come from the persisted
  // months (statement prints, shown as printed); the demand dollar is quotable
  // only for a reconciled meter (the AR-15 gate), and only when demand was
  // actually billed (a zero sum reads as absence, not a fabricated "None owed").
  const nemSummary = summarizeNemMonths(meter.nemPeriods);
  const demandSumCents = isCovered
    ? meter.periods.reduce<number>((sum, p) => sum + (p.demandCents ?? 0), 0)
    : 0;

  return {
    isCovered,
    drProgram: drEnrollment(meter.periods[meter.periods.length - 1]?.lineItems ?? []),
    latest,
    history,
    showSolar: meter.isSolar || meter.nemType !== null,
    solar: {
      nemType: meter.nemType,
      trueUpMonth: meter.trueUpMonth,
      solarKw: meter.solarKw,
      arrays: meter.benefitingArrays.map((a) => ({
        id: a.id,
        name: a.name,
        nameplateKw: a.nameplateKw,
      })),
      position: nemSummary?.position ?? null,
      nemChargesCents: nemSummary?.nemChargesCents ?? null,
      trueUpAmountCents: meter.trueUpAmountCents,
      demandOwedCents: meter.isSolar && demandSumCents > 0 ? demandSumCents : null,
    },
  };
}
