// The normalized internal shape every data source maps into. Two mappers target
// it today, normalizeEspi (PG&E Green Button / ESPI XML) and normalizeBayou
// (Bayou v2 JSON), and the importer consumes only this shape, so adding a source
// later means writing one more mapper, not touching the DB edge or the engine.
//
// Types only: no logic, no DB, no UI. The mappers are pure functions in this dir.

import type { IntervalReading } from "@/lib/energy/types";
import type {
  BillingLineItemKind,
  BillingLineItemUnit,
  CoverageState,
} from "@/lib/recommendations/types";

/** Meter commodity. The engine is electric-only; gas is carried, not promoted. */
export type Fuel = "electric" | "gas";

/** A single demand-related charge line item read off a billing summary. */
export type NormalizedDemandCharge = {
  note: string;
  usd: number;
};

/**
 * One billing cycle's summary, source-agnostic. Dollar figures are always USD and
 * energy is always kWh, regardless of the source's native units (ESPI uses
 * 1/100,000 of a dollar and watt-hours; Bayou uses integer cents and watt-hours).
 * Mirrors the BillingPeriod columns the importer and retrospective lever read; the
 * derived peak kW is computed downstream from `intervals`, not carried here.
 */
export type NormalizedSummary = {
  /** Billing period start, ISO 8601. */
  start: string;
  /** Billing period close, ISO 8601. */
  close: string;
  /** Rate schedule for the cycle, e.g. "AG-C" (ESPI) or "Residential - Electric" (Bayou). */
  tariff: string | null;
  /** Every demand line item; empty for sources/tariffs without demand charges. */
  demandCharges: NormalizedDemandCharge[];
  /** Sum of the demand line items; null when the summary carries none. */
  demandChargeUsd: number | null;
  /** Total bill for the period, USD; null when absent. */
  totalBillUsd: number | null;
};

/**
 * One service point (one Pump) with its usage, normalized from any source.
 *
 * Identity is split deliberately:
 * - `serviceId` is the stable service-agreement id (SA ID). ESPI: the UsagePoint id.
 *   Bayou: `additional_attributes.service_number`. This is the key the importer
 *   upserts on and the reconciliation point against the grower's spreadsheet.
 * - `meterSerial` is the physical meter, which churns when PG&E swaps hardware.
 *   ESPI does not expose it (null); Bayou: `meters[].id`. Stored, never keyed on.
 *
 * `accountNumber` is the PG&E account this meter bills under (Bayou:
 * `account_numbers[].id`; ESPI: not in the standard feed, so null). The importer
 * resolves it to a first-class Account; the legal Entity above the account is
 * filled in later from the spreadsheet, so it is not on this shape.
 */
export type NormalizedMeter = {
  serviceId: string;
  meterSerial: string | null;
  accountNumber: string | null;
  fuel: Fuel;
  /** Convenience: the most recent/first tariff seen, if any. */
  tariff: string | null;
  /** Flattened service address, if present. */
  address: string | null;
  /** 15-minute kWh readings, sorted by start. Empty for gas meters (no kWh series). */
  intervals: IntervalReading[];
  /** Per-cycle summaries, sorted by start. */
  summaries: NormalizedSummary[];
};

// --- The canonical billing shape (integer cents) -------------------------------------
//
// The source-agnostic, multi-period billing shape that the dashboard (Epic 2), the energy
// levers, and recommendations read after normalization - never a RawExtraction page type.
// The PDF extractor (Story 1.6 normalize) and the future Bayou adapter both target THIS
// shape, so swapping the source changes nothing downstream (AR-5). Billed dollar amounts
// are integer cents (AR-6); usage and rates keep full precision.
//
// NOTE: the float-USD NormalizedMeter / NormalizedSummary above is the older Bayou/ESPI
// path; the two converge onto this integer-cents shape in a later story (see deferred-work).

/** One billed line item. amountCents is integer cents; quantity/rate keep full precision. */
export type CanonicalLineItem = {
  kind: BillingLineItemKind;
  label: string | null;
  /** Integer US cents. Never a float dollar. */
  amountCents: number;
  /** kWh / kW, full precision; null for flat line items. */
  quantity: number | null;
  unit: BillingLineItemUnit | null;
  /** $/unit, full precision; null for flat line items. */
  rate: number | null;
};

/** One TOU energy bucket for the period (Peak / Part-Peak / Off-Peak). */
export type CanonicalTouBucket = {
  period: string;
  kWh: number;
  amountCents: number;
};

/** One billing period for one SA, post-normalize. */
export type CanonicalBillingPeriod = {
  saId: string;
  /** ISO 8601 period start. */
  start: string;
  /** ISO 8601 period close (the source's period end). */
  close: string;
  /** ISO 8601 actual posted close; distinct from the scheduled serial-code close (AR-14). */
  cycleClose: string | null;
  tariff: string | null;
  /** True when a three-tier (Part-Peak) TOU split is present (legacy AG-5). */
  isLegacyTou: boolean;
  touSplit: CanonicalTouBucket[];
  demandKw: number | null;
  demandAmountCents: number | null;
  lineItems: CanonicalLineItem[];
  /** The SA printed total; line items reconcile to it within one cent (Story 1.7). */
  printedTotalCents: number;
  coverageState: CoverageState;
};

/** One meter's canonical billing across periods. UI and recommendations read this only. */
export type CanonicalBill = {
  /** The canonical (descriptor-stripped) SA ID; the inventory join key (Story 1.6). */
  saId: string;
  /** The trailing P0xx/label suffix preserved off the raw SA ID, or null (AC2). */
  saIdDescriptor: string | null;
  meterNumber: string | null;
  growerPumpId: string | null;
  periods: CanonicalBillingPeriod[];
};

// --- The canonical NEM reconciliation shape (Story 1.5) -------------------------------
//
// Solar NEM is separate from per-meter charges: it is a generating array's bundled
// monthly net-usage rows plus an annual true-up. The dashboard/recs read THIS shape
// (never the raw NemReconciliation page); the pure mapper is normalizeNem in ./nem.ts.
// Billed amounts are integer cents (AR-6); netKwh keeps full precision and MAY be
// negative when generation exceeded consumption (FR-3) - never floored to zero.

/** One NEM monthly period. netKwh is negative in over-production months (never floored). */
export type CanonicalNemMonth = {
  /** ISO 8601 period start. */
  start: string;
  /** ISO 8601 period end. */
  close: string;
  /** Net metered kWh, full precision; NEGATIVE when generation > consumption. */
  netKwh: number;
  /** Integer US cents for the row, or null when the page carries no per-row amount. */
  amountCents: number | null;
};

/**
 * One generating array's NEM reconciliation, post-normalize. Linked to the array by the
 * generating SA ID; the array's benefiting meters are named by SA ID (the NEMA graph,
 * built from the spreadsheet in Story 1.2). When the generating SA ID matches no array,
 * `arrayId` is null and `coverageState` is "needs_review" - never a fabricated link (AC3).
 */
export type CanonicalNemReconciliation = {
  /** Trimmed SA ID of the generating array's service (carried even when unlinkable). */
  generatingSaId: string;
  /** Matched SolarArray id; null => needs_review (no fabricated link). */
  arrayId: string | null;
  arrayName: string | null;
  /** Recurring annual settle month (1-12). */
  trueUpMonth: number | null;
  /** ISO 8601 date of the printed true-up statement, when present. */
  trueUpDate: string | null;
  /** Annual true-up amount, integer cents (negative = net credit to the grower). */
  trueUpAmountCents: number | null;
  /** The bundled monthly rows as distinct periods, in order (AC1). */
  months: CanonicalNemMonth[];
  /** The generating array's benefiting meters, by SA ID (AC3). Empty when unlinkable. */
  benefitingMeterSaIds: string[];
  /** "needs_review" when unlinkable; else "no_bill" (Story 1.7 sets "reconciled"). */
  coverageState: CoverageState;
};
