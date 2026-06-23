// The ONE shared solar/NEM identity + settlement predicate (the hardening seam). A solar/NEM
// meter nets generation against use, so its MONTHLY charge pages omit the energy that settles
// only at the ANNUAL true-up: a monthly net-metering dollar from those pages would mislead. This
// module is the single, tested place every surface (the read-layer cost source, the KPI rollups,
// the table cell, the drawer billing gate, the bill-audit runner) decides "is this a solar/NEM
// meter" and "has its true-up settled", so the rule can never drift across surfaces.
//
// PURE: no DB, no UI, no Prisma, no MeterView. The input is a narrow structural Pick so the
// predicate can be applied to a Prisma pump row, a MeterView, or any shape that carries the
// solar identity fields.

/** The solar IDENTITY facts a meter carries (a narrow superset across all call sites). */
export type SolarMeterIdentity = {
  /** The importer's solar flag. */
  isSolar: boolean;
  /** Paired array nameplate kW; non-null implies a solar-paired meter. */
  solarKw: number | null;
  /** The net-metering program token (e.g. "nem2"); non-null implies NEM even if isSolar is unset. */
  nemType: string | null;
};

/** The true-up SETTLEMENT fact: the printed annual reconciliation amount, integer cents. */
export type SolarMeterSettlement = {
  /** The printed annual true-up amount, integer cents; null until a statement settles it. */
  trueUpAmountCents: number | null;
};

/**
 * Is this a solar / net-metering meter? A SUPERSET predicate (any one signal triggers): the
 * importer's `isSolar` flag, a paired array (`solarKw`), OR a net-metering program token
 * (`nemType`) alone. `nemType`-only must trigger, because a meter that carries a NEM program but
 * was never flagged isSolar still settles at true-up and must never emit a monthly net figure.
 * Widening to nemType is a strict correctness improvement over the prior `isSolar || solarKw`
 * inline checks (it catches more solar meters, never fewer).
 */
export function isSolarNemMeter(m: SolarMeterIdentity): boolean {
  return m.isSolar || m.solarKw !== null || m.nemType !== null;
}

/** A solar meter's NEM settlement state: "settled" once a printed true-up amount is on file
 *  (the ANNUAL figure is honestly showable), else "unsettled" (no monthly net dollar, ever). */
export function nemSettlement(m: SolarMeterSettlement): "settled" | "unsettled" {
  return m.trueUpAmountCents != null ? "settled" : "unsettled";
}
