// The RawExtraction layer: exactly what Claude returns per PG&E bill page (Story 1.4/1.5
// populate it via generateObject). Zod is the single source of truth (AR-4) - every TS
// type here is `z.infer` of its schema, never a parallel hand-written interface. Billed
// dollar amounts are integer cents (AR-6); usage/rates keep full precision. Nothing here
// is the canonical shape - that lives in @/lib/normalize/types after normalization, and
// this module must never be imported into /app (the no-raw-source-in-ui guard enforces it).

import { z } from "zod";

/** A PG&E bill page is classified into one of these before any extraction schema runs. */
export const PageTypeSchema = z.enum([
  "payment_confirmation",
  "account_summary",
  "per_sa_summary_list",
  "per_sa_charge_detail",
  "nem_reconciliation",
]);
export type PageType = z.infer<typeof PageTypeSchema>;

/** Integer US cents (e.g. 1172733 = $11,727.33). The reconciliation surface (AR-6). */
const Cents = z.number().int().describe("integer US cents, e.g. 1172733 = $11,727.33");

/** One time-of-use energy line as printed (Peak / Part-Peak / Off-Peak). */
export const TouEnergyLineSchema = z.object({
  period: z.string().describe("TOU period label as printed: Peak | Part-Peak | Off-Peak"),
  kWh: z.number().describe("metered kWh for the period, full precision (6dp)"),
  rate: z.number().describe("$/kWh as printed, full precision (5dp)"),
  amountCents: Cents,
});
export type TouEnergyLine = z.infer<typeof TouEnergyLineSchema>;

/** A non-bypassable charge or any other printed line item composing the SA total. */
export const ChargeLineSchema = z.object({
  label: z.string(),
  amountCents: Cents,
});
export type ChargeLine = z.infer<typeof ChargeLineSchema>;

/** Per-Service-Agreement charge detail: the page that composes one meter's printed total. */
export const PerSaChargeDetailSchema = z.object({
  pageType: z.literal("per_sa_charge_detail"),
  saId: z.string().describe("Service Agreement / SA ID as printed"),
  meterNumber: z.string().nullable().describe("physical meter #, for the identity check in 1.6"),
  growerPumpId: z.string().nullable().describe("grower P0xx Pump ID, for the identity check in 1.6"),
  rateName: z.string().describe("printed rate schedule name, e.g. AG-5B"),
  // The printed service period. Required: a charge-detail page always prints "Service From
  // ... To ...", and the canonical period needs real dates - never fabricated (NFR-4). A page
  // that does not yield these fails safeParse and the pipeline routes it to needs_review.
  serviceStart: z.string().describe("ISO service period start as printed"),
  serviceEnd: z.string().describe("ISO service period end as printed"),
  cycleClose: z
    .string()
    .nullable()
    .describe("ISO posted statement close (AR-14); null if not separately printed"),
  touEnergy: z
    .array(TouEnergyLineSchema)
    .describe("2 buckets (current two-tier) or 3 (legacy three-tier Part-Peak)"),
  demandKw: z.number().nullable().describe("billed demand kW as printed"),
  demandAmountCents: Cents.nullable(),
  nbcLineItems: z.array(ChargeLineSchema).describe("non-bypassable charges"),
  otherLineItems: z.array(ChargeLineSchema).describe("every other line item composing the total"),
  printedTotalCents: Cents.describe("the SA's printed total; line items reconcile to it (Story 1.7)"),
});
export type PerSaChargeDetail = z.infer<typeof PerSaChargeDetailSchema>;

/** One NEM monthly row; kWh MAY be negative (over-production) - never floored at zero (FR-3). */
export const NemMonthlyRowSchema = z.object({
  periodStart: z.string().describe("ISO date of the row's period start"),
  periodEnd: z.string().describe("ISO date of the row's period end"),
  kWh: z.number().describe("net kWh; negative when generation exceeded consumption"),
  amountCents: Cents.nullable(),
});
export type NemMonthlyRow = z.infer<typeof NemMonthlyRowSchema>;

/** Per-SA NEM reconciliation page: the bundled monthly rows plus the annual true-up. */
export const NemReconciliationSchema = z.object({
  pageType: z.literal("nem_reconciliation"),
  saId: z.string(),
  monthlyRows: z.array(NemMonthlyRowSchema),
  // The recurring settle month (1-12), mirrored by SolarArray.trueUpMonth.
  trueUpMonth: z.number().int().min(1).max(12).nullable(),
  // The actual printed true-up statement date (ISO). Distinct from the recurring
  // settle month: captures the day as printed, never floored to the month (AC1).
  // Null when the page is not a true-up statement (an off-cycle monthly page).
  trueUpDate: z
    .string()
    .nullable()
    .describe("ISO date of the printed annual true-up statement; null off true-up month"),
  trueUpAmountCents: Cents.nullable(),
});
export type NemReconciliation = z.infer<typeof NemReconciliationSchema>;

/** The per-SA summary list (the account-level list of each SA's printed total). */
export const PerSaSummaryListSchema = z.object({
  pageType: z.literal("per_sa_summary_list"),
  rows: z.array(z.object({ saId: z.string(), printedTotalCents: Cents })),
});
export type PerSaSummaryList = z.infer<typeof PerSaSummaryListSchema>;

/** The account summary page: the account-level printed total (account-level reconcile, 1.7). */
export const AccountSummarySchema = z.object({
  pageType: z.literal("account_summary"),
  accountNumber: z.string().nullable(),
  printedTotalCents: Cents,
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;

/** The payment-confirmation page: no billing detail; modeled minimally so classify can skip it. */
export const PaymentConfirmationSchema = z.object({
  pageType: z.literal("payment_confirmation"),
  paymentAmountCents: Cents.nullable(),
});
export type PaymentConfirmation = z.infer<typeof PaymentConfirmationSchema>;

/** Discriminated union over pageType: what one classified + extracted page yields. */
export const RawPageSchema = z.discriminatedUnion("pageType", [
  PaymentConfirmationSchema,
  AccountSummarySchema,
  PerSaSummaryListSchema,
  PerSaChargeDetailSchema,
  NemReconciliationSchema,
]);
export type RawPage = z.infer<typeof RawPageSchema>;
