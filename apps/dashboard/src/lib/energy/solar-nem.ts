// Lever 4: solar / NEM. The honest, retrospective solar finding a grower can see
// in their own bills: solar offsets daytime energy, but the demand charge is set
// by the evening peak when the panels are nearly off, so solar does NOT lower
// that charge. Two generations live here: the legacy demo path (`solarNemChecks`,
// interval-era inputs, 4-9pm conflation - demo seed only) and the canonical-shape
// `nemDemandInsight` (Story 3.4) computed from persisted NEM months + reconciled
// demand cents, tied to the 5-8pm RATE peak (tou.ts). Full aggregation-allocation
// modeling across meters is a later pass; this surfaces what the data already shows.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in solar-nem.test.ts.

import { en } from "@/copy/en";
import { draftRecommendation } from "@/lib/recommendations";
import type { DraftRecommendation } from "@/lib/recommendations";
import type { CoverageState } from "@/lib/recommendations/types";
import { isInPeakWindow } from "./peak";
import { planFromLabel } from "./rate-lever";
import type { RateCard } from "./rates";
import type { CycleBill } from "./types";

/** The `tool` tag on every recommendation this module emits. */
export const SOLAR_TOOL = "solar";

export type SolarNemInput = {
  farmId: string;
  pumpId: string;
  pumpName: string;
  timezone: string;
  /** NEM program, e.g. "nem2". A solar-paired meter only. */
  nemType: string | null;
  /** Annual true-up month, 1-12. */
  trueUpMonth: number | null;
  /** Paired array nameplate (kW); null means this meter has no solar. */
  solarKw: number | null;
  /** Posted cycles, carrying demand charge + when the peak was set. */
  bills: readonly CycleBill[];
  /** Local "today"; becomes the recs' createdAt. */
  asOf: string;
};

/**
 * Solar/NEM checks for one solar-paired meter. Emits up to two recommendations:
 * (1) "solar is not covering your demand charge" when the meter's biggest demand
 * charge is set in the 4-9pm window, and (2) a NEM2 true-up tracking note. Returns
 * an empty list for meters without solar.
 */
export function solarNemChecks(input: SolarNemInput): DraftRecommendation[] {
  if (input.solarKw === null) return [];
  const recs: DraftRecommendation[] = [];

  // (1) The demand charge is set in the evening, when solar is nearly off.
  const eveningPeakBills = input.bills.filter(
    (b) =>
      b.demandChargeUsd !== null &&
      b.demandChargeUsd > 0 &&
      b.peakAt != null &&
      isInPeakWindow(b.peakAt, input.timezone),
  );
  if (eveningPeakBills.length > 0) {
    const worst = eveningPeakBills.reduce((a, b) =>
      (b.demandChargeUsd ?? 0) > (a.demandChargeUsd ?? 0) ? b : a,
    );
    recs.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId: input.farmId,
        severity: "watch",
        createdAt: input.asOf,
        situation: en.solar.demandPeak.situation(input.pumpName),
        impactUsd: worst.demandChargeUsd ?? undefined,
        impactNote: en.solar.demandPeak.impact(worst.demandChargeUsd ?? 0),
        action: {
          kind: "review_solar_peak",
          label: en.solar.demandPeak.action(),
          params: {
            pumpId: input.pumpId,
            solarKw: input.solarKw,
            demandChargeUsd: worst.demandChargeUsd,
            peakAt: worst.peakAt ?? null,
          },
          execute: null,
        },
      }),
    );
  }

  // (2) NEM2 true-up tracking.
  if (input.nemType && input.trueUpMonth) {
    const month = en.pumpTiming.monthLabel(input.trueUpMonth - 1);
    recs.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId: input.farmId,
        severity: "info",
        createdAt: input.asOf,
        situation: en.solar.trueUp.situation(input.pumpName, month),
        impactNote: en.solar.trueUp.impact(month),
        action: {
          kind: "track_trueup",
          label: en.solar.trueUp.action(month),
          params: {
            pumpId: input.pumpId,
            nemType: input.nemType,
            trueUpMonth: input.trueUpMonth,
            solarKw: input.solarKw,
          },
          execute: null,
        },
      }),
    );
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Story 3.4: the canonical-shape NEM demand insight.
// ---------------------------------------------------------------------------

/**
 * Net-zero band for the energy position: |net kWh| under 1% of the biggest
 * month's |net kWh|, floored at 50 kWh, reads "made about as much as it used".
 * Documented constants, pinned by tests - not magic inline numbers.
 */
export const NET_ZERO_FLOOR_KWH = 50;
export const NET_ZERO_FRACTION = 0.01;

/**
 * The position claim is always SCOPED TO ITS EVIDENCE: the copy states the
 * month count ("across its last 2 solar statements"), because a seasonal
 * window routinely contradicts the annual position (winter exports vs summer
 * consumption). `monthsCounted` rides on the insight so the surface can say
 * exactly how much evidence backs the phrase - never more than is on file.
 */

/** One persisted NEM month, as the statement printed it. */
export type NemMonthInput = {
  /** ISO 8601 period start (the month's identity for dedupe). */
  start: string;
  /** Net metered kWh; negative = net export that month. */
  netKwh: number;
  /** Integer cents for the row; negative = credit. */
  amountCents: number;
};

export type NemEnergyPosition = "net_credit" | "net_zero" | "net_consumer";

export type NemDemandInsightInput = {
  isSolar: boolean;
  /** The meter's stored schedule, as the bill prints it. */
  scheduleLabel: string | null;
  /** The meter's coverage state; only "reconciled" demand dollars are quotable. */
  coverageState: CoverageState;
  nemMonths: NemMonthInput[];
  /** Demand cents per cycle from reconciled billing (null = no demand line). */
  cycleDemandCents: (number | null)[];
  /** Printed annual true-up, integer cents, when on file. */
  trueUpAmountCents: number | null;
  card: RateCard;
};

export type NemDemandInsight = {
  position: NemEnergyPosition;
  /** Summed net kWh across the deduped months (full precision). */
  netKwh: number;
  /** Summed printed NEM charges across the deduped months, integer cents. */
  nemChargesCents: number;
  /** Demand charge owed across reconciled cycles, integer cents (> 0 by gate). */
  demandOwedCents: number;
  trueUpAmountCents: number | null;
  monthsCounted: number;
};

export type NemMonthsSummary = {
  position: NemEnergyPosition;
  netKwh: number;
  nemChargesCents: number;
  monthsCounted: number;
};

/**
 * Sum the printed NEM months into the meter's energy position. Months dedupe on
 * the CALENDAR MONTH of their start (the first 7 chars of the ISO string):
 * real statements print the same month with off-by-a-day starts across formats,
 * and a double-counted month corrupts both the position and the charges sum.
 * Null when no months are on file - position is never fabricated. Shared by the
 * feed insight and the drawer's solar section.
 */
export function summarizeNemMonths(months: NemMonthInput[]): NemMonthsSummary | null {
  const seen = new Set<string>();
  let netKwh = 0;
  let nemChargesCents = 0;
  let maxAbsMonthKwh = 0;
  let monthsCounted = 0;
  for (const month of months) {
    const bucket = month.start.slice(0, 7);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    netKwh += month.netKwh;
    nemChargesCents += month.amountCents;
    maxAbsMonthKwh = Math.max(maxAbsMonthKwh, Math.abs(month.netKwh));
    monthsCounted += 1;
  }
  if (monthsCounted === 0) return null;

  const netZeroBandKwh = Math.max(NET_ZERO_FLOOR_KWH, NET_ZERO_FRACTION * maxAbsMonthKwh);
  const position: NemEnergyPosition =
    Math.abs(netKwh) <= netZeroBandKwh
      ? "net_zero"
      : netKwh < 0
        ? "net_credit"
        : "net_consumer";
  return { position, netKwh, nemChargesCents, monthsCounted };
}

/**
 * The solar/NEM demand insight (FR-15): renders ONLY for a meter that is NEM
 * solar AND bills on the AG-C family (the demand-carrying schedule gate) AND is
 * reconciled AND actually owes a demand charge. Everything else returns null -
 * fail closed; explaining solar economics where they do not apply is worse than
 * silence. The position comes from the printed NEM months (deduped by start);
 * the demand dollar from reconciled billing line items.
 */
export function nemDemandInsight(input: NemDemandInsightInput): NemDemandInsight | null {
  if (!input.isSolar) return null;
  if (input.scheduleLabel === null) return null;
  const plan = planFromLabel(input.scheduleLabel, input.card, null);
  if (plan === null || plan.family !== "AG-C") return null;
  if (input.coverageState !== "reconciled") return null;

  const demandOwedCents = input.cycleDemandCents.reduce<number>(
    (sum, cents) => sum + (cents ?? 0),
    0,
  );
  if (demandOwedCents <= 0) return null;

  // No printed NEM months yet: the position would be a guess, so no insight.
  // With months on file the position is stated SCOPED to the month count (the
  // copy says "across its last N solar statements") - an honest claim about
  // the evidence, never an annual assertion from a seasonal window.
  const summary = summarizeNemMonths(input.nemMonths);
  if (summary === null) return null;

  return {
    position: summary.position,
    netKwh: summary.netKwh,
    nemChargesCents: summary.nemChargesCents,
    demandOwedCents,
    trueUpAmountCents: input.trueUpAmountCents,
    monthsCounted: summary.monthsCounted,
  };
}

// ---------------------------------------------------------------------------
// Story E-1 (FR21): the demand-uncovered share, a pure sibling of nemDemandInsight.
// ---------------------------------------------------------------------------

/**
 * FR21. The share of the billed demand charge that solar does NOT offset, in
 * [0,1]. Solar never reduces the demand charge (it is set in the evening peak
 * when the panels are nearly off), so this is structurally the demand-vs-total
 * ratio for the qualifying meter:
 *
 *   demandOwedCents / (demandOwedCents + offsettableCents)
 *
 * computed only from honest billed figures already on the insight plus the
 * cycle line items. Carries NO dollar - it is a ratio rendered as a percentage
 * (tnum) beside the demand dollar, never a savings claim and never a percentage
 * multiplied into a dollar to imply a credit (FR10/FR23).
 *
 * Returns null when the share is not quotable - the same fail-closed posture as
 * nemDemandInsight: the offsettable portion is not on file, a figure is
 * negative, or the denominator is non-positive (no divide-by-zero, no guess).
 * nemDemandInsight is reused UNCHANGED (FR22/FR27); this is a separate function.
 */
export function demandUncoveredShare(args: {
  demandOwedCents: number;
  /** The solar-offsettable energy portion of the bill, integer cents; null = not on file. */
  offsettableCents: number | null;
}): number | null {
  const { demandOwedCents, offsettableCents } = args;
  if (offsettableCents === null) return null;
  // Honest billed figures only: a negative demand or a negative offsettable
  // portion is not a quotable ratio, so fail closed rather than guess.
  if (demandOwedCents < 0 || offsettableCents < 0) return null;
  const total = demandOwedCents + offsettableCents;
  if (total <= 0) return null;
  const share = demandOwedCents / total;
  // Structurally in [0,1] given the non-negative guards above; clamp defensively
  // so a floating-point edge can never surface a value outside the bound.
  return Math.min(1, Math.max(0, share));
}

// ---------------------------------------------------------------------------
// Story E-2 (FR23): the demand/service/non-bypassable floor.
// ---------------------------------------------------------------------------

/** One billed line item, reduced to the only two fields the floor needs: its kind
 *  and its integer-cent amount. Mirrors `BillingLineItemKind` without importing the
 *  loader (this stays pure energy logic; the caller maps its rows down to this). */
export type FloorLineItem = {
  kind: "tou_energy" | "demand" | "nbc" | "other";
  amountCents: number;
};

/**
 * The bill floor: the charges solar categorically does NOT offset, separated from
 * the solar-offsettable energy. Solar reduces daytime energy use; it never touches
 * the demand charge (set by the evening peak), a non-bypassable charge, or the flat
 * service/customer charge. So the floor is `demand + nbc + service(other)` and the
 * offsettable portion is the `tou_energy` buckets.
 *
 * Pure over already-billed integer cents (NFR1): no UI, no DB, no clock, no rate
 * math, no fabrication. Negative line amounts (credits) are clamped to zero per
 * bucket so a one-off credit line never understates the floor or inflates the
 * offsettable denominator into a fake share. `floorCents` is the labeled-group sum
 * (FR23); `offsettableCents` feeds `demandUncoveredShare` (FR21). When no line
 * items carry an offsettable bucket, `offsettableCents` is null (not on file), so
 * `demandUncoveredShare` fails closed rather than quoting a 100% from absence.
 */
export type SolarBillFloor = {
  /** Demand charge across the cycles, integer cents (>= 0). */
  demandCents: number;
  /** Non-bypassable charges across the cycles, integer cents (>= 0). */
  nbcCents: number;
  /** Flat service / customer charge (the `other` bucket), integer cents (>= 0). */
  serviceCents: number;
  /** The labeled-group floor sum: demand + nbc + service, integer cents (>= 0). */
  floorCents: number;
  /** The solar-offsettable energy portion (tou_energy), integer cents; null when no
   *  offsettable line item is on file (so the share fails closed, never a fake 100%). */
  offsettableCents: number | null;
};

/** Clamp a per-bucket sum to non-negative integer cents: a credit line (negative
 *  amount) must never reduce the honest floor or pad the offsettable denominator. */
function nonNegCents(cents: number): number {
  return cents > 0 ? Math.round(cents) : 0;
}

export function solarBillFloor(lineItems: readonly FloorLineItem[]): SolarBillFloor {
  let demand = 0;
  let nbc = 0;
  let service = 0;
  let offsettable = 0;
  let sawOffsettable = false;
  for (const li of lineItems) {
    if (li.kind === "demand") demand += li.amountCents;
    else if (li.kind === "nbc") nbc += li.amountCents;
    else if (li.kind === "other") service += li.amountCents;
    else if (li.kind === "tou_energy") {
      offsettable += li.amountCents;
      sawOffsettable = true;
    }
  }
  const demandCents = nonNegCents(demand);
  const nbcCents = nonNegCents(nbc);
  const serviceCents = nonNegCents(service);
  return {
    demandCents,
    nbcCents,
    serviceCents,
    floorCents: demandCents + nbcCents + serviceCents,
    offsettableCents: sawOffsettable ? nonNegCents(offsettable) : null,
  };
}
