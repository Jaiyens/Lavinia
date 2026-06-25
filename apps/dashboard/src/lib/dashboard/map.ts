// Pure derivation for the Map lens (Story 2.9, FR-12): split the canonical inventory into
// pins (meters with a real, valid location) and the "no location yet" tray (everything
// else - never silently dropped, never given a fake pin). Resolution order today is the
// inventory lat/lng only; the fuller AR-8 chain is a documented seam:
//   1. inventory latitude/longitude (live - the only populated source),
//   2. PLSS Section-Township-Range -> committed BLM centroid lookup
//      (TODO: lands with the Epic 1 extraction of the bills' land descriptions; no
//      source field exists in the schema yet, so there is nothing to look up),
//   3. street address -> the stubbed Census geocoder boundary
//      (see src/lib/onboarding/geocode.ts - network forbidden, deterministic stub).
// The attention flag carries the two honest concern signals available today (the same
// law as the 2.4 table): coverage needs_review or a flagged-BAD pump. No $-at-risk model
// until Epic 3. No DB, no UI.

import type { MeterView } from "./load";
import { meterPeakKw } from "./table";

const RECONCILED = "reconciled";

export type MapPin = {
  meterId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** needs_review coverage or BAD status: the pin earns clay; calm pins are green. */
  attention: boolean;
  /** PG&E rate schedule, verbatim; drives the pin color in the Energy map's "rate" encoding. */
  rateSchedule: string | null;
  /** Legacy AG-4/AG-5 flag straight off the meter (the importer's flag; the map ALSO derives
   *  legacy from the rate string, since the flag is not always set in the data). */
  isLegacy: boolean;
  /** Sum of this meter's RECONCILED printed bills in integer cents (AR-15: reconciled only), or
   *  null when nothing is proven. Drives the pin SIZE in the "rate" encoding. */
  annualSpendCents: number | null;
  /** Pump health read verbatim from the master sheet; null when unknown. */
  status: string | null;
  /** Pump capacity in gallons per minute; null when not on file. */
  gpm: number | null;
  /** Latest billed 15-min peak demand kW (table.ts's meterPeakKw); null when no period carries one. */
  peakKw: number | null;
  /** PG&E account number; null when not on file. */
  accountNumber: string | null;
  /** Ranch/property rollup name; null when not on file. */
  ranchName: string | null;
  /** The grower's "P0xx" Pump ID from the master sheet; null until loaded. */
  growerPumpId: string | null;
  /**
   * An OPTIONAL, additive "true-up soon" signal, set only by surfaces that carry it (the solar Map
   * lens, FR35). When true the marker draws a quiet ring around the status dot - a third encoded
   * dimension on top of the attention/calm hue, never a hue of its own (color is never the only
   * signal). Defaults to falsy/undefined, so the Energy map and the Home hero pins are unchanged.
   * It is a timing signal, never a dollar (a true-up credit stays honest-blank until a statement
   * is on file).
   */
  trueUpSoon?: boolean;
  /**
   * The meter's latest printed bill in integer cents, for the floating map label - but ONLY
   * when the meter is `reconciled` (AR-15 honesty rule: a dollar figure renders only when
   * proven). null otherwise, so the map shows a status dot instead of a fabricated number.
   */
  latestBillCents: number | null;
};

export type UnlocatedMeter = {
  meterId: string;
  name: string;
};

export type MapData = {
  pins: MapPin[];
  unlocated: UnlocatedMeter[];
};

/** Sum a meter's RECONCILED printed bills (AR-15: only proven money counts); null when the meter
 *  is not reconciled or carries no printed total. Mirrors kpi.ts's reconciled-only spend gate. */
function reconciledSpendCents(meter: MeterView): number | null {
  if (meter.coverageState !== RECONCILED) return null;
  let cents: number | null = null;
  for (const p of meter.periods) {
    if (p.printedTotalCents != null) cents = (cents ?? 0) + p.printedTotalCents;
  }
  return cents;
}

export function toMapPins(meters: readonly MeterView[]): MapData {
  const pins: MapPin[] = [];
  const unlocated: UnlocatedMeter[] = [];
  for (const meter of meters) {
    const { latitude, longitude } = meter;
    const valid =
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      // Exact (0,0) in utility/spreadsheet exports is an unfilled-field artifact, not a
      // meter in the Gulf of Guinea; one such row would blow the fitBounds camera out to
      // span the Atlantic. It reads as "no location yet" (the tray), never a fake pin.
      !(latitude === 0 && longitude === 0);
    if (valid) {
      // Latest printed bill, gated on `reconciled` (AR-15): the newest period's printed total,
      // shown only when the meter's coverage is proven; otherwise null (status dot, no number).
      const latest = meter.periods[meter.periods.length - 1];
      const reconciled = meter.coverageState === RECONCILED;
      const latestBillCents =
        reconciled && latest?.printedTotalCents != null ? latest.printedTotalCents : null;
      pins.push({
        meterId: meter.id,
        name: meter.name,
        latitude,
        longitude,
        attention: meter.coverageState === "needs_review" || meter.status === "BAD",
        rateSchedule: meter.rateSchedule,
        isLegacy: meter.isLegacy,
        annualSpendCents: reconciledSpendCents(meter),
        status: meter.status,
        gpm: meter.gpm,
        peakKw: meterPeakKw(meter),
        accountNumber: meter.accountNumber,
        ranchName: meter.ranchName,
        growerPumpId: meter.growerPumpId,
        latestBillCents,
      });
    } else {
      unlocated.push({ meterId: meter.id, name: meter.name });
    }
  }
  return { pins, unlocated };
}
