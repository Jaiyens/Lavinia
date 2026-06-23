// Single source of truth for the Recommendation grammar's union values.
// SQLite stores these as String; these types keep the app honest. Every tool
// emits Recommendations in this exact shape so the farmer learns the OS once.

export type Severity = "info" | "watch" | "act";
export type RecStatus = "pending" | "todo" | "done" | "dismissed" | "overridden";
export type PersonRole = "owner" | "manager" | "irrigator";
export type Language = "en" | "es";
export type ConnectionType = "pge_smd" | "cimis" | "pesticide" | "payroll";
// A metered load is either an irrigation pump or a non-pump load (office, shop,
// home) that pump-timing ignores. Auto-classified at onboarding, farmer-overridable.
export type PumpKind = "pump" | "non_pump";
// Electric pumps are metered by PG&E; diesel/gas pumps are entered by hand and
// carry no service ID or interval history.
export type PowerSource = "electric" | "diesel" | "gas";
// Pump health read verbatim from the master spreadsheet's Status field (FR-17).
// BAD is the flagged health signal; no efficiency number is ever derived from it.
export type PumpStatus = "GOOD" | "BAD" | "NEW WELL" | "OLD";

// An array's net-metering program type (Solar tab, C-3/FR11). Single-meter solar ("nem"),
// aggregation across two-plus meters ("nema"), or virtual NEM ("vnem"). Mirrors the
// `SolarProgramType` union in src/lib/energy/solar-allocation.ts so a typo'd token is a compile
// error; mirrored by the DM3-widened SolarArray.nemType Prisma String ("nem2" | "nem2_agg" |
// "vnem"). VNEM is forward-compatible (no launch instance in the Batth cohort).
export type SolarProgramType = "nem" | "nema" | "vnem";

// The stable, lower-snake action kinds the Solar tool (SOLAR_TOOL) emits (architecture: "Finding
// action kinds"). Shaped so a later agentic OS can EXECUTE them; v1 only displays the label. Each is
// a string literal so a typo'd kind is a compile error and the dedupe/render paths read one set:
//   review_solar_demand - F2, the LIVE demand-gap insight (run-solar-insight.ts), reused
//   verify_aggregation  - F3, the C-4 dropped/mismatched-share audit (the credit honest-blank)
//   verify_solar_schedule, protect_grandfather, investigate_array, track_trueup, enroll_demand_response
//     are net-new emitters teed up for later solar stories (F1, F4-F7).
export type SolarActionKind =
  | "review_solar_demand"
  | "verify_aggregation"
  | "verify_solar_schedule"
  | "protect_grandfather"
  | "investigate_array"
  | "track_trueup"
  | "enroll_demand_response";

// Billing coverage for a Meter/Account (FR-6). One union, one render treatment
// everywhere (table cell, drawer, map pin, rollup, CSV) per AR-15; mirrored as a Prisma
// String column. A figure renders only when "reconciled"; otherwise the cell shows the
// coverage state, never a fabricated number.
export type CoverageState = "no_bill" | "needs_review" | "reconciled";

// The kind of a billed line item composing a period's printed total (mirrors the Prisma
// BillingLineItem.kind String). Settled by extraction (Story 1.4/1.6): a TOU energy bucket,
// the demand charge, a non-bypassable charge, or any other printed line. One union so a
// typo'd kind is a compile error (the same discipline as PumpStatus / CoverageState).
export type BillingLineItemKind = "tou_energy" | "demand" | "nbc" | "other";
// The unit of a line item's quantity (kWh for energy, kW for demand); null for flat charges.
export type BillingLineItemUnit = "kWh" | "kW";

// `action` and `result` are stored as Json columns. Constrain them to genuinely
// JSON-serializable values so the shapes below stay honest end to end (and assign
// cleanly to Prisma's Json inputs without `any`).
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * The executable hook. v1 leaves this absent/null and only displays the action's
 * `label`. When the OS goes agentic, `execute` carries the concrete command to
 * run (which system, what operation, what payload) without changing the
 * Recommendation shape every tool already emits. `dryRun` lets a tool preview the
 * effect before the farmer commits.
 */
export type ExecutableCommand = {
  target: string; // system/integration to act on, e.g. "pge_smd" | "pump_controller"
  operation: string; // verb the target understands, e.g. "delay_start" | "stagger"
  payload?: JsonObject; // structured args for the operation
  dryRun?: boolean;
};

/**
 * `action` is structured so a later agentic OS can EXECUTE it; v1 only displays
 * `label`. Keep `label` plain-language and farmer-facing (no jargon, no em dashes).
 */
export type RecommendationAction = {
  kind: string; // machine verb, e.g. "stagger_pumps" | "hold_set" | "shift_load"
  label: string; // farmer-facing, plain language (displayed today)
  params?: JsonObject; // structured args the verb reads
  execute?: ExecutableCommand | null; // null/absent in v1; the agentic hook later
};

/**
 * `result` closes the loop after a bill posts: predicted vs actual, what the
 * farmer followed, and the dollars avoided. Filled in when `status` resolves.
 */
export type RecommendationResult = {
  followed?: boolean;
  predictedUsd?: number;
  actualUsd?: number;
  avoidedUsd?: number;
  note?: string;
};

/**
 * The universal Recommendation grammar every tool emits (mirrors the Prisma
 * model). At this pure layer timestamps are ISO strings, so the math stays
 * deterministic and testable; the DB edge maps them to DateTime. The agentic
 * `execute` hook lives on `action`, not here.
 */
export type Recommendation = {
  id: string;
  farmId: string;
  tool: string; // e.g. "pump-timing"
  situation: string;
  action: RecommendationAction;
  impactUsd?: number;
  impactNote?: string;
  severity: Severity;
  status: RecStatus;
  createdAt: string; // ISO 8601
  resolvedAt?: string; // ISO 8601, once the loop closes
  result?: RecommendationResult;
};

/**
 * What a pure tool function emits: the grammar minus the persistence-assigned
 * `id`. `status` is "pending" at emission and `createdAt` is the analysis's
 * `asOf` reference. The DB layer assigns the id on save (same split as the
 * Green Button parser feeding the importer).
 */
export type DraftRecommendation = Omit<Recommendation, "id">;
