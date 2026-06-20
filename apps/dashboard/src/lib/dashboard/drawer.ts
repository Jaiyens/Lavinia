// Pure derivation for the meter drawer (Story 2.5): project one canonical MeterView into the
// render model the drawer component displays. The AR-15 coverage gate lives HERE, inside the
// pure function, so the component cannot leak an ungated dollar figure: a meter that is not
// reconciled yields NO billing figures (latest = null, history = []), only its inventory and
// coverage state. No DB, no UI, no copy - labels stay nullable and the component maps absence
// to grower language.

import { drEnrollment, type DrProgram } from "@/lib/energy/dr";
import { verifyBill, type BillVerification } from "@/lib/energy/bill-verify";
import {
  demandUncoveredShare,
  solarBillFloor,
  summarizeNemMonths,
  type NemEnergyPosition,
} from "@/lib/energy/solar-nem";
import { allocateArray } from "@/lib/energy/solar-allocation";
import {
  grandfatherPosition,
  type GrandfatherPosition,
} from "@/lib/energy/solar-grandfather";
import type { RateCard } from "@/lib/energy/rates";
import type { MeterView } from "./load";

/**
 * Sum a meter's per-cycle `totalKwh` SUMMARIES into one cumulative usage basis (C-2, NFR4). null when
 * no cycle carries a totalKwh (not-on-file), never a fabricated zero. Never reads the interval series.
 */
function cumulativeKwhFor(meter: MeterView): number | null {
  let seen = false;
  let sum = 0;
  for (const p of meter.periods) {
    if (p.totalKwh !== null && Number.isFinite(p.totalKwh)) {
      seen = true;
      sum += p.totalKwh;
    }
  }
  return seen ? sum : null;
}

/**
 * The drilled-in meter's usage-proportional allocation share for the drawer (C-2, FR8). Honest by
 * construction: it is quotable only when the meter benefits from EXACTLY ONE array (the Batth cohort
 * - a single-array meter), so "share of this array" is unambiguous; a meter under multiple arrays
 * stays honest-blank (null) rather than guess which array's split to show. Computed by the pure
 * `allocateArray` over that array's benefiting meters' cumulative usage (summaries only, NFR4). null
 * when the fleet is not supplied (the Energy drawer), when there is not exactly one array, or when
 * this meter has no billed usage (not-on-file). NO credit dollar is computed.
 */
function drawerAllocationShare(meter: MeterView, allMeters: MeterView[] | undefined): number | null {
  if (allMeters === undefined) return null;
  if (meter.benefitingArrays.length !== 1) return null;
  const array = meter.benefitingArrays[0];
  if (array === undefined) return null;
  // The array's benefiting meters are exactly those whose benefitingArrays list this array id.
  const basis = allMeters
    .filter((m) => m.benefitingArrays.some((a) => a.id === array.id))
    .map((m) => ({ pumpId: m.id, meterName: m.name, cumulativeKwh: cumulativeKwhFor(m) }));
  const allocation = allocateArray(array.id, array.name, basis);
  return allocation.shares.find((s) => s.pumpId === meter.id)?.share ?? null;
}

/**
 * F-1/F-3 (FR16/FR18): the grandfather position of the meter's single array, for the drawer row.
 * Honest-unknown unless the meter sits under EXACTLY ONE array (otherwise we cannot say which array's
 * vintage is the meter's), an `asOf` is supplied, and the array carries an interconnection date in the
 * NEM2 cohort. Never a guessed vintage. With no `asOf` (the Energy drawer) it stays honest-unknown.
 */
function drawerGrandfather(meter: MeterView, asOf: string | undefined): GrandfatherPosition {
  if (asOf === undefined) return { state: "unknown" };
  if (meter.benefitingArrays.length !== 1) return { state: "unknown" };
  const array = meter.benefitingArrays[0];
  if (array === undefined) return { state: "unknown" };
  return grandfatherPosition({
    interconnectionDate: array.interconnectionDate,
    nemType: array.nemType,
    asOf,
  });
}

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

/**
 * The drawer's program-code resolution (A-9, FR2/FR5). The drilled-in meter's net-metering program
 * said the way the grower recognizes it, never the raw `nem2` token and never a guessed granular
 * code. This mirrors A-4's `resolveProgramCode` contract inline so the drawer repeats the list's
 * legibility honestly until the shared `program-code.ts` module lands:
 *   - `"generic"`: the source carries only the generic `nem2`-family token; render the generic
 *     program plus a not-on-file note for the granular six-code label, never an inferred NEM2AA.
 *   - `"unknown"`: the source is null or unrecognized; render not-on-file, never inferred from an
 *     adjacent meter, never written back.
 * A recognized granular six-code value would render `"granular"` with the exact code; the committed
 * fixture carries only the generic token, so that branch is forward-compatible (no launch instance).
 */
export type DrawerProgram =
  | { kind: "granular"; code: string }
  | { kind: "generic"; raw: string }
  | { kind: "unknown" };

/** The recognized granular six-code program labels (FR2). The source field is OQ2-resolved; today
 *  the fixture carries only the generic `nem2`, so this set is the forward-compatible branch. */
const GRANULAR_PROGRAM_CODES: ReadonlySet<string> = new Set([
  "NEM2AA",
  "NEM2AG",
  "NEM2M",
  "NEMEXPM",
  "NEMEXP",
  "NEMS",
]);

/**
 * Resolve the drilled-in meter's program code from its raw source token (A-9, FR2/FR5). Pure, no
 * inference from any other meter, no write-back. A recognized granular six-code value resolves to
 * that exact code; the generic `nem2`-family token resolves to `generic` (the generic program plus a
 * not-on-file granular note); a null or unrecognized token resolves to `unknown` (not-on-file).
 */
export function resolveDrawerProgram(rawSourceValue: string | null): DrawerProgram {
  if (rawSourceValue === null) return { kind: "unknown" };
  const trimmed = rawSourceValue.trim();
  if (trimmed === "") return { kind: "unknown" };
  if (GRANULAR_PROGRAM_CODES.has(trimmed.toUpperCase())) {
    return { kind: "granular", code: trimmed.toUpperCase() };
  }
  if (trimmed.toLowerCase().startsWith("nem2")) return { kind: "generic", raw: trimmed };
  return { kind: "unknown" };
}

export type DrawerSolar = {
  nemType: string | null;
  /** The resolved program code (A-9, FR2/FR5): granular | generic | unknown, never an inferred or
   *  raw token. The drawer renders its plain-English meaning, repeating the list's legibility. */
  program: DrawerProgram;
  /** NEM annual settle month (1-12); null when not on file. */
  trueUpMonth: number | null;
  /** Paired array nameplate kW carried on the meter; null when not on file. */
  solarKw: number | null;
  /** Usage-proportional allocation share in [0,1] (C-2, FR8); null = not-on-file (no billed usage,
   *  not exactly one array, or the fleet not supplied). The credit DOLLAR beside it stays honest-blank
   *  until a statement settles it - never a fabricated zero, never a percent multiplied into a dollar. */
  allocationShare: number | null;
  /** F-1/F-3 (FR16/FR18): the 20-year-from-PTO grandfather position of the meter's single array.
   *  `unknown` when the interconnection date is not on file (the launch state), the meter is under
   *  zero or several arrays, or the array is not in the NEM2 cohort - honest-unknown, never a guessed
   *  vintage. The drawer row reads not-on-file there. */
  grandfather: GrandfatherPosition;
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
  /** E-2 (FR21): the share of the bill solar does NOT cover, in [0,1]; null when not
   *  quotable (no offsettable energy on file, the same fail-closed posture). Rendered
   *  as a whole percent beside the demand dollar, never a credit, never a percent
   *  multiplied into a dollar. */
  uncoveredShare: number | null;
  /** E-2 (FR23): the demand/service/non-bypassable floor - the charges solar
   *  categorically does not offset - as a labeled group, integer cents; null when not
   *  quotable (unreconciled or no billed line items). Shown visually separated from the
   *  net-metering honest-blank so no layout reads as a composite "solar saved you X". */
  floor: { demandCents: number; serviceCents: number; nbcCents: number; totalCents: number } | null;
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

/**
 * Project one canonical MeterView into the drawer render model. `allMeters` (the active farm's
 * fleet) is OPTIONAL: when supplied (the Solar drawer), the solar section's allocation row carries
 * the real usage-proportional share (C-2); when omitted (the Energy drawer), the share stays
 * honest-blank. Everything else is unchanged.
 */
export function toDrawerDetail(
  meter: MeterView,
  allMeters?: MeterView[],
  asOf?: string,
): DrawerDetail {
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

  // E-2 (FR21/FR23): the floor (the charges solar never offsets) and the uncovered
  // share, from the same reconciled line items the demand dollar trusts. Quotable
  // only for a reconciled solar meter that actually owes a demand charge (the AR-15
  // gate plus the demand-billed gate, mirroring demandOwedCents). Otherwise null:
  // honest-blank, never a fabricated floor or a fake 100% share.
  const demandOwedCents = meter.isSolar && demandSumCents > 0 ? demandSumCents : null;
  const billFloor = solarBillFloor(meter.periods.flatMap((p) => p.lineItems));
  const solarFloor =
    isCovered && demandOwedCents !== null
      ? {
          demandCents: billFloor.demandCents,
          serviceCents: billFloor.serviceCents,
          nbcCents: billFloor.nbcCents,
          totalCents: billFloor.floorCents,
        }
      : null;
  const uncoveredShare =
    demandOwedCents !== null
      ? demandUncoveredShare({
          demandOwedCents,
          offsettableCents: billFloor.offsettableCents,
        })
      : null;

  return {
    isCovered,
    drProgram: drEnrollment(meter.periods[meter.periods.length - 1]?.lineItems ?? []),
    latest,
    history,
    showSolar: meter.isSolar || meter.nemType !== null,
    solar: {
      nemType: meter.nemType,
      // A-9 (FR2/FR5): the program said in plain words, resolved from the meter's own token only -
      // never inferred from another meter, never a guessed granular code. The drawer repeats the
      // list's legibility (the Arrays lens ProgramChip and the Table lens program cell agree).
      program: resolveDrawerProgram(meter.nemType),
      trueUpMonth: meter.trueUpMonth,
      solarKw: meter.solarKw,
      // C-2 (FR8/FR10): the real usage-proportional share when the fleet is supplied and the meter
      // sits under exactly one array; honest-blank otherwise. The credit dollar stays honest-blank
      // regardless - never a fabricated zero, never a percent multiplied into a credit dollar.
      allocationShare: drawerAllocationShare(meter, allMeters),
      // F-1/F-3 (FR16/FR18): honest-unknown at launch (no PTO date on file), a real countdown the
      // moment an interconnection date lands for a meter under a single NEM2 array.
      grandfather: drawerGrandfather(meter, asOf),
      arrays: meter.benefitingArrays.map((a) => ({
        id: a.id,
        name: a.name,
        nameplateKw: a.nameplateKw,
      })),
      position: nemSummary?.position ?? null,
      nemChargesCents: nemSummary?.nemChargesCents ?? null,
      trueUpAmountCents: meter.trueUpAmountCents,
      demandOwedCents,
      uncoveredShare,
      floor: solarFloor,
    },
  };
}
