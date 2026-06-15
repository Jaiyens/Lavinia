// The AI extraction boundary. The pipeline is source-agnostic: it splits, classifies,
// and Zod-validates, but HOW a page becomes structured data (a Claude call vs a fixture)
// is injected. This keeps extraction at zero external calls in dev/CI (project-context),
// the same way source.ts / vision.ts stub their boundaries. `stubPageReader` is the
// dev/test default; `createGatewayReader` (Story 1.8) is the LIVE reader, constructed only
// on the admin/dev import path where the AI Gateway key is present.

import { generateObject } from "ai";
import { z } from "zod";
import { createGatewayModel } from "@/lib/ai/gateway";
import {
  AccountSummarySchema,
  NemReconciliationSchema,
  type PageType,
  PageTypeSchema,
  PaymentConfirmationSchema,
  PerSaChargeDetailSchema,
  PerSaSummaryListSchema,
} from "./schema";

export interface PageReader {
  /** Classify a single-page PDF; runs BEFORE any extraction schema is chosen (AC1, FR-2). */
  classify(page: Uint8Array, index: number): Promise<PageType>;
  /** Return the raw extracted object for a classified page; the pipeline validates it with Zod. */
  extract(page: Uint8Array, type: PageType): Promise<unknown>;
}

/**
 * The un-wired reader: throws if used without injection. Dev and tests inject their own
 * reader (a fake fed the committed fixture); the live reader is `createGatewayReader`.
 */
export const stubPageReader: PageReader = {
  classify() {
    throw new Error("PageReader not wired: inject a reader (createGatewayReader is the live one)");
  },
  extract() {
    throw new Error("PageReader not wired: inject a reader (createGatewayReader is the live one)");
  },
};

// --- The live Vercel AI Gateway reader (Story 1.8) ------------------------------------

/** The extraction schema per page type. generateObject validates the model output against it. */
const EXTRACT_SCHEMA: Record<PageType, z.ZodTypeAny> = {
  payment_confirmation: PaymentConfirmationSchema,
  account_summary: AccountSummarySchema,
  per_sa_summary_list: PerSaSummaryListSchema,
  per_sa_charge_detail: PerSaChargeDetailSchema,
  nem_reconciliation: NemReconciliationSchema,
};

const ClassificationSchema = z.object({
  pageType: PageTypeSchema.describe("the single page type that best matches this page"),
});

const CLASSIFY_PROMPT =
  "You are reading ONE page of a scanned PG&E commercial energy statement. Classify it into " +
  "exactly one page type:\n" +
  "- payment_confirmation: a 'Congratulations! Your payment has been scheduled' stub.\n" +
  "- account_summary: the first 'Your Account Summary' page or the final 'Your Electric Charges Breakdown'.\n" +
  "- per_sa_summary_list: a 'Summary of your energy related services' list of many SAs and totals.\n" +
  "- per_sa_charge_detail: a 'Details of Electric Charges' / 'Details of Electric Monthly Charges' page for ONE Service Agreement.\n" +
  "- nem_reconciliation: a 'Summary of NEM Charges' / 'Details of NEM Charges' page for a solar SA.\n" +
  "Return only the page type.";

function extractPrompt(type: PageType): string {
  const base =
    "Extract the billing data from this single scanned PG&E statement page. Rules: every dollar " +
    "amount is INTEGER CENTS (e.g. $11,727.33 -> 1172733); usage (kWh) and rates ($/kWh, kW) keep " +
    "full printed precision; net usage may be NEGATIVE for solar export (never floor it at zero); " +
    "preserve the Service Agreement ID EXACTLY as printed, including any trailing descriptor " +
    "(e.g. '4692494679 P003' or '4699664820 PUMP #55'). If a value is not on the page, use null. ";
  switch (type) {
    case "per_sa_charge_detail":
      return (
        base +
        "Capture rate name, meter #, the grower Pump ID, the printed service period (serviceStart/serviceEnd) " +
        "and posted cycleClose, each TOU energy bucket (Peak/Part-Peak/Off-Peak) with kWh/rate/amount, the demand " +
        "charge, every NBC and other line item, and the SA's printed total."
      );
    case "nem_reconciliation":
      return (
        base +
        "Capture the bundled monthly rows (each a distinct period with net kWh that may be negative) and the " +
        "annual true-up month, date, and amount."
      );
    default:
      return base + "Capture the printed totals and identifiers for this page.";
  }
}

// The Gateway key resolution + model construction now live in the shared `@/lib/ai/gateway`
// boundary (so the reader and the Almond assistant can never drift). Re-export `hasGatewayKey`
// here to preserve this module's public API (src/lib/extract/index.ts and onboarding/sources.ts
// import it from here).
export { hasGatewayKey } from "@/lib/ai/gateway";

/**
 * The LIVE reader over the Vercel AI Gateway + AI SDK v6 (AR-3): `generateObject` with an
 * `"anthropic/claude-*"` provider string, each single-page PDF passed as a Claude native file
 * part (no rasterization). Defaults to Opus 4.8 for accuracy on rough scans; the importer runs
 * the cheaper Sonnet first and escalates cent-gate failures to Opus (the documented cost lever).
 * generateObject auto-retries with corrective prompting on a Zod-validation failure.
 */
export function createGatewayReader(modelId = "anthropic/claude-opus-4-8"): PageReader {
  const model = createGatewayModel(modelId);
  return {
    async classify(page) {
      const { object } = await generateObject({
        model,
        schema: ClassificationSchema,
        schemaName: "PageClassification",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: CLASSIFY_PROMPT },
              { type: "file", data: page, mediaType: "application/pdf" },
            ],
          },
        ],
      });
      return object.pageType;
    },
    async extract(page, type) {
      const schema = EXTRACT_SCHEMA[type];
      if (!schema) throw new Error(`no extraction schema for page type ${type}`);
      const { object } = await generateObject({
        model,
        schema,
        schemaName: "BillPage",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractPrompt(type) },
              { type: "file", data: page, mediaType: "application/pdf" },
            ],
          },
        ],
      });
      return object as unknown;
    },
  };
}
