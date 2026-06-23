/**
 * The canonical farm-data SNAPSHOT handed to the code-gen export pipeline (the POC's single source of
 * truth). Every number in a generated report must trace back to a value HERE; the snapshot is also the
 * allowlist the verifier scans the rendered PDF against (src/lib/almond/codegen/verify.ts).
 *
 * There is no `analyzeFarm()` on this branch — the snapshot is COMPOSED from the same shipped, grounded
 * loaders the dashboard and the deterministic report skill already read:
 *   - meters:   loadMetersForFarm (src/lib/dashboard/load.ts) — the FULL MeterView
 *   - findings: loadFindings (src/lib/dashboard/findings.ts)
 *   - spend:    computeKpiStrip (src/lib/dashboard/kpi.ts)
 *   - coverage: summarizeExportState (src/lib/almond/export/load.ts)
 *   - solar:    buildSolarContextByMeter (src/lib/almond/tools.ts) — the per-meter share / demand owed
 *
 * THE PRINCIPLE (the whole reason this file is COMPREHENSIVE, not thin): anything Almond can ANSWER about
 * the farm in chat, it must be able to PUT IN a generated sheet/PDF. The chat tools read the full
 * MeterView (entity, ranch, blocks, cost source, solar program, per-cycle line items); a thin snapshot
 * starved the codegen of all of that, so a generated workbook came back with a blank Entity column and
 * only two cost sources. So the snapshot now carries a COMPREHENSIVE per-meter record + farm-level
 * rollups. The discipline that keeps it honest is unchanged: money is INTEGER CENTS, and `null` means
 * NOT ON FILE — never a fabricated 0 or a guessed name (the renderer prints "Not on file" for a null).
 *
 * Money is INTEGER CENTS end to end (no float drift); a pre-formatted `savingsDisplay` rides alongside
 * the opportunities so the model renders an exact, dashboard-matching dollar string rather than
 * formatting cents itself.
 *
 * The composition is split into PURE functions (`extractOpportunities`, `projectMeter`, the rollups,
 * `composeReportSnapshot`) so the logic — the rate-switch narrowing, the cents conversion, the sort/rank,
 * the totals, the per-meter projection — is unit-tested offline with synthetic fixtures (snapshot.test.ts),
 * zero DB. `buildReportSnapshot(deps)` is the thin Prisma wiring that feeds the loaders into the pure core.
 */

import { loadMetersForFarm, type CostSource, type MeterView } from "@/lib/dashboard/load";
import { loadFindings, type FindingView } from "@/lib/dashboard/findings";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { summarizeExportState } from "@/lib/almond/export/load";
// NOTE: `buildSolarContextByMeter` and `AlmondToolDeps` both live in tools.ts, which transitively
// imports the codegen skills that import THIS file — a function-only module cycle. It is safe because
// nothing here calls `buildSolarContextByMeter` at module load (only inside `buildReportSnapshot`), so by
// the time it runs the binding is resolved; do not move a call to it to the top level.
import { buildSolarContextByMeter, type AlmondToolDeps } from "@/lib/almond/tools";
import type { MeterSolarContext } from "@/lib/almond/shape";
import type { GrandfatherPosition } from "@/lib/energy/solar-grandfather";

/** One ranked, money-saving opportunity in the snapshot. The ADDRESSABLE array element the manifest's
 *  `sourcePath` points at (e.g. `opportunities[0].savingsCents`), so it is the verification anchor. */
export type SnapshotOpportunity = {
  /** 1-based rank by savings (descending); rank 1 is the biggest opportunity. */
  rank: number;
  meterName: string;
  /** The meter's CURRENT rate schedule (from the MeterView), or null if unknown. */
  fromRate: string | null;
  /** The grounded suggested rate (finding.rateSwitchTo). */
  toRate: string;
  /** Estimated annual savings, integer cents. */
  savingsCents: number;
  /** Pre-formatted dollar string of `savingsCents`, e.g. "$61,417.76" (the model renders THIS). */
  savingsDisplay: string;
  /** The opportunity category. The POC populates only rate switches; the union is future-proofing. */
  kind: "rate_switch" | "demand_charge" | "bill_audit" | "solar";
};

/** A block (field) a meter serves, projected for the snapshot. `acreage` is null when not on file. */
export type SnapshotBlock = { name: string; acreage: number | null };

/** One array whose NEM credits offset a solar meter, projected for the snapshot. Each field is null
 *  when not on file (never a fabricated kW / month / date). `grandfather` is the array's grandfather
 *  position (computed by buildSolarDataset off the interconnection date), "unknown" when no PTO date. */
export type SnapshotSolarArray = {
  name: string | null;
  nameplateKw: number;
  nemType: string | null;
  trueUpMonth: number | null;
  interconnectionDate: string | null;
  grandfather: GrandfatherPosition;
};

/** One printed NEM reconciliation month, projected for the snapshot. */
export type SnapshotNemPeriod = {
  start: string;
  close: string;
  netKwh: number;
  amountCents: number;
};

/** The solar context for a meter in the snapshot. STRUCTURE + TIMING + the F2 demand-owed dollar only;
 *  no net-metering credit dollar (it is honest-blank until a true-up statement is uploaded). Every
 *  money figure is integer cents, every field null when not on file. */
export type SnapshotMeterSolar = {
  isSolar: boolean;
  nemType: string | null;
  /** Paired array nameplate kW carried on the meter; null when not on file. */
  solarKw: number | null;
  /** NEM annual settle month (1-12); null when not on file. */
  trueUpMonth: number | null;
  /** Printed annual true-up amount, integer cents; null when not on file. */
  trueUpAmountCents: number | null;
  /** ISO 8601 date of the printed true-up statement; null when not on file. */
  trueUpDate: string | null;
  /** Arrays whose credits offset this meter; empty when none on file. */
  benefitingArrays: SnapshotSolarArray[];
  /** Printed NEM months, ascending; empty when none persisted. */
  nemPeriods: SnapshotNemPeriod[];
  /** This meter's largest usage-proportional array share, in [0,1]; null when no usage on file. */
  sharePct: number | null;
  /** The billed demand charge solar does not cover, integer cents; null when no demand insight on file. */
  demandOwedCents: number | null;
  /** The portion of the bill solar does not cover, in [0,1]; null when not quotable. */
  uncoveredShare: number | null;
  /** The grandfather position of the best-protected array crediting this meter; "unknown" when no PTO
   *  date is on file (the launch state). Mirrors the per-meter context the Solar tab reads. */
  grandfather: GrandfatherPosition;
};

/** One recent billing cycle, projected with the energy/demand/NBC split (WS6 item 6). Money is integer
 *  cents; a cell is null only when the cycle genuinely has no value on file. The split (`energyCents`,
 *  `nbcCents`) is summed from the cycle's line items, so a generated workbook can show how a bill breaks
 *  down without the model re-deriving it. */
export type SnapshotRecentBill = {
  start: string;
  close: string;
  /** SA printed total in integer cents; null until reconciled. */
  printedTotalCents: number | null;
  /** Demand charge in integer cents; null when none on file. */
  demandCents: number | null;
  totalKwh: number | null;
  peakKw: number | null;
  tariff: string | null;
  /** Sum of the cycle's tou_energy line items, integer cents (0 when none — a real 0, not absence). */
  energyCents: number;
  /** Sum of the cycle's nbc (non-bypassable charge) line items, integer cents. */
  nbcCents: number;
};

/**
 * The COMPREHENSIVE per-meter record the codegen reads — everything Almond can answer about one meter
 * in chat, projected from the full MeterView (+ its solar context) so a generated sheet/PDF can carry
 * it too. `null` is NOT ON FILE everywhere (never a fabricated 0 or a guessed name); money is integer
 * cents. The verifier mines a number from every field here, so any of these values can legitimately be
 * printed; the renderer prints "Not on file" for a null rather than inventing a value.
 */
export type ComprehensiveSnapshotMeter = {
  id: string;
  name: string;
  serviceId: string | null;
  accountNumber: string | null;
  /** The legal entity's display name; null when not on file. */
  entityName: string | null;
  /** The legal entity's billing name (how PG&E prints it); null when not on file. */
  entityBillingName: string | null;
  ranchName: string | null;
  cropName: string | null;
  /** Blocks (fields) this meter serves; empty when none on file. */
  blocks: SnapshotBlock[];
  rateSchedule: string | null;
  isLegacy: boolean;
  serialCode: string | null;
  /** Pump health verbatim from the master sheet; null when unknown. */
  status: string | null;
  /** The pump motor's prime mover ("electric" | "diesel" | "gas"); null when not on file. */
  powerSource: string | null;
  gpm: number | null;
  latitude: number | null;
  longitude: number | null;
  coverageState: string;
  /** Cost provenance: BILLED (a real posted bill), MODELED (an estimate), REVIEW, or NONE. */
  costSource: CostSource;
  /** Modeled monthly tariff-component estimate in integer cents; null unless there is an interval basis
   *  (render only when costSource === "MODELED"). */
  modeledMonthlyCents: number | null;
  /** Latest reconciled printed total in integer cents; null UNLESS costSource === "BILLED" (mirrors the
   *  dashboard table's coverage gate — an unreconciled meter's billed money is null, never a fake 0). */
  latestBilledCents: number | null;
  /** Latest demand charge in integer cents from the freshest period; null when none on file. */
  latestDemandCents: number | null;
  /** Latest peak kW from the freshest period; null when none on file. */
  latestPeakKw: number | null;
  /** ISO 8601 close of the freshest period; null when no period on file. */
  latestCycleClose: string | null;
  /** The last up to 3 billing cycles, freshest last, with the energy/demand/NBC split. */
  recentBills: SnapshotRecentBill[];
  /** The meter's solar program/structure/timing (always present; `isSolar` says whether it is solar). */
  solar: SnapshotMeterSolar;
};

/** One distinct legal entity on the farm, with how PG&E prints it and how many meters it carries. */
export type SnapshotEntity = {
  name: string;
  /** The entity's billing name; null when the same as `name` or not on file. */
  billingName: string | null;
  meterCount: number;
};

/** Farm-level fleet rollups the Summary tab prints (composed from the KPI strip + the meter projection).
 *  `spendDeltaCents` is the latest-vs-prior month delta (negative = spend fell); `biggestMover` is the
 *  meter whose bill moved the most. Both null when there is not enough reconciled history. */
export type SnapshotFleetSummary = {
  meterCount: number;
  /** Power-source counts ("electric" -> n). A meter with none on file is bucketed under "(unknown)". */
  bySource: Record<string, number>;
  /** Pump-health/status counts. A meter with none on file is bucketed under "(unknown)". */
  byStatus: Record<string, number>;
  /** Latest-vs-prior month spend delta in integer cents; null when < 2 reconciled months. */
  spendDeltaCents: number | null;
  /** The meter whose bill moved the most (and by how much, integer cents); null when none. */
  biggestMover: { meterName: string; deltaCents: number } | null;
};

/** One pending finding projected for the snapshot (ALL pending findings, not just rate switches). The
 *  generated report can list every opportunity/issue the dashboard surfaces. `impactUsd` is null when
 *  the finding carries no dollar; `meterName` is null for a fleet-level finding. */
export type SnapshotFinding = {
  situation: string;
  actionLabel: string | null;
  actionKind: string | null;
  /** Legacy float DOLLARS as stored on the finding row; null when no dollar impact. */
  impactUsd: number | null;
  /** The finding's one honest money story (e.g. the F2 demand-charge gap dollar), verbatim from the
   *  row; null when none. The chat states this, so the snapshot must carry it (parity) and the verifier
   *  must admit its number. */
  impactNote: string | null;
  severity: FindingView["severity"];
  meterName: string | null;
};

/** The canonical snapshot the sandbox renders over and the verifier checks against. */
export type ReportSnapshot = {
  farm: { id: string; name: string };
  /** Total meters on the farm (the coverage denominator; an allowed structural number). */
  meterCount: number;
  /** The freshest BILLED cycle the figures reflect, ISO 8601, or null when no bill has posted. */
  coverageAsOf: string | null;
  totals: {
    /** Latest reconciled month spend in cents, or null when no meter is reconciled (never a fake $0). */
    latestMonthSpendCents: number | null;
    /** Sum of the shown opportunities' savings, integer cents. */
    rateSwitchSavingsCents: number;
    /** Coverage counts the Summary tab prints (structural integers). */
    reconciledCount: number;
    needsReviewCount: number;
    noBillCount: number;
  };
  /** The top opportunities by savings (POC: rate switches), the report's subject + verification source. */
  opportunities: SnapshotOpportunity[];
  /** The distinct legal entities on the farm (the Entity column / per-entity grouping the chat answers). */
  entities: SnapshotEntity[];
  /** The fleet rollups (power source, pump health, spend delta, biggest mover) the Summary tab prints. */
  fleetSummary: SnapshotFleetSummary;
  /** ALL pending findings (every opportunity/issue), highest-impact first. */
  findings: SnapshotFinding[];
  /** The COMPREHENSIVE per-meter records — everything Almond can answer about each meter, so a generated
   *  sheet/PDF carries it. The verifier folds every number here into the allowlist. */
  meters: ComprehensiveSnapshotMeter[];
};

/** The minimal meter shape the opportunity join needs (MeterView satisfies it). */
type OpportunityMeter = { id: string; name: string; rateSchedule: string | null };

/** A rate-switch opportunity before ranking/formatting. */
export type OpportunitySource = {
  meterName: string;
  fromRate: string | null;
  toRate: string;
  savingsCents: number;
};

/** The most opportunities the POC's "top 5" report shows. */
const TOP_OPPORTUNITIES = 5;

/** The most recent billing cycles a meter's projection carries (freshest last). */
const RECENT_BILLS = 3;

/** The bucket label for a meter field (power source / status) with nothing on file. */
const UNKNOWN_LABEL = "(unknown)";

/**
 * Format integer cents as a US dollar string with cent precision and thousands separators, e.g.
 * 6_141_776 -> "$61,417.76". Deterministic and self-contained so the snapshot's display string and the
 * verifier's allowlist (which re-derives the same forms) can never drift. Exported for the verifier.
 */
export function formatCentsUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Extract the rate-switch opportunities from the farm's findings, joined to the meters in scope. Mirrors
 * the deterministic report skill's narrowing EXACTLY (src/lib/almond/skills/generate-report.ts
 * `readRateSwitch`): a finding qualifies only when it carries a grounded `rateSwitchTo` (the engine
 * wrote `action.kind === "switch_rate"` with `params.toSchedule`) AND a `meterId` that resolves to a
 * meter in scope. Savings is the finding's float-dollar `impactUsd` converted to a non-negative whole
 * cent — the same conversion the PDF's savings section uses, so the snapshot and that report agree.
 * Pure: no Prisma, no clock.
 */
export function extractOpportunities(
  meters: readonly OpportunityMeter[],
  findings: readonly FindingView[],
): OpportunitySource[] {
  const metersById = new Map(meters.map((m) => [m.id, m]));
  const out: OpportunitySource[] = [];
  for (const f of findings) {
    if (f.meterId === null || f.rateSwitchTo === null) continue;
    const meter = metersById.get(f.meterId);
    if (meter === undefined) continue; // finding for a meter outside the loaded set
    const savingsCents = Math.max(0, Math.round((f.impactUsd ?? 0) * 100));
    out.push({
      meterName: meter.name,
      fromRate: meter.rateSchedule,
      toRate: f.rateSwitchTo,
      savingsCents,
    });
  }
  return out;
}

/** The freshest period on a meter (periods are start-ascending in MeterView), or undefined when none. */
function latestPeriod(m: MeterView): MeterView["periods"][number] | undefined {
  return m.periods[m.periods.length - 1];
}

/** The latest RECONCILED printed total, gated EXACTLY like the dashboard table's `costCents` (AR-15):
 *  a billed dollar is surfaced only when the meter's cost provenance is BILLED; otherwise null (never a
 *  fabricated 0 for an unreconciled meter). */
function latestBilledCentsOf(m: MeterView, costSource: CostSource): number | null {
  if (costSource !== "BILLED") return null;
  for (let i = m.periods.length - 1; i >= 0; i--) {
    const cents = m.periods[i]?.printedTotalCents;
    if (typeof cents === "number") return cents;
  }
  return null;
}

/** Sum a cycle's line items of one kind into integer cents (0 when none — a real 0, not absence). */
function sumLineItems(period: MeterView["periods"][number], kind: "tou_energy" | "nbc"): number {
  let total = 0;
  for (const li of period.lineItems) if (li.kind === kind) total += li.amountCents;
  return total;
}

/** Project a meter's solar context (structure + timing + the F2 demand-owed dollar), reading the same
 *  per-meter `MeterSolarContext` the Solar tab/chat read. No net-metering credit dollar is ever carried.
 *  A non-solar meter still gets the shape (with `isSolar: false`) so the per-meter record is uniform. */
function projectSolar(m: MeterView, ctx: MeterSolarContext | undefined): SnapshotMeterSolar {
  const grandfather: GrandfatherPosition = ctx?.grandfather ?? { state: "unknown" };
  return {
    isSolar: m.isSolar,
    nemType: m.nemType,
    solarKw: m.solarKw,
    trueUpMonth: m.trueUpMonth,
    trueUpAmountCents: m.trueUpAmountCents,
    trueUpDate: m.trueUpDate,
    benefitingArrays: m.benefitingArrays.map((a) => ({
      name: a.name,
      nameplateKw: a.nameplateKw,
      nemType: a.nemType,
      trueUpMonth: a.trueUpMonth,
      interconnectionDate: a.interconnectionDate,
      // Per-array grandfather is not carried on MeterView; the per-meter `ctx.grandfather` is the best
      // (most-protected) array's position, which is the one the chat/tab surface. Use it for each array
      // here so the snapshot never asserts a per-array vintage it cannot trace.
      grandfather,
    })),
    nemPeriods: m.nemPeriods.map((p) => ({
      start: p.start,
      close: p.close,
      netKwh: p.netKwh,
      amountCents: p.amountCents,
    })),
    sharePct: ctx?.sharePct ?? null,
    demandOwedCents: ctx?.demandOwedCents ?? null,
    uncoveredShare: ctx?.uncoveredShare ?? null,
    grandfather,
  };
}

/**
 * Project one full MeterView (+ its solar context) into the COMPREHENSIVE per-meter record. Pure: every
 * field is read straight off the MeterView with the SAME coverage gating the dashboard table uses, so a
 * generated sheet/PDF prints exactly what the chat could answer. `null` stays `null` (not on file) — this
 * function never substitutes a 0 or a placeholder name. `costSource`/`powerSource` carry the loader's
 * value; on a bare fixture MeterView with neither set we fall back to the honest NONE / null.
 */
export function projectMeter(m: MeterView, ctx: MeterSolarContext | undefined): ComprehensiveSnapshotMeter {
  // costSource is always set by loadMetersForFarm; a bare fixture MeterView may omit it (NONE is the
  // honest default — no proven cost basis), which also makes latestBilledCents null.
  const costSource: CostSource = m.costSource ?? "NONE";
  const latest = latestPeriod(m);
  const recentBills: SnapshotRecentBill[] = m.periods.slice(-RECENT_BILLS).map((p) => ({
    start: p.start,
    close: p.close,
    printedTotalCents: p.printedTotalCents,
    demandCents: p.demandCents,
    totalKwh: p.totalKwh,
    peakKw: p.peakKw,
    tariff: p.tariff,
    energyCents: sumLineItems(p, "tou_energy"),
    nbcCents: sumLineItems(p, "nbc"),
  }));
  return {
    id: m.id,
    name: m.name,
    serviceId: m.serviceId,
    accountNumber: m.accountNumber,
    entityName: m.entityName,
    entityBillingName: m.entityBillingName ?? null,
    ranchName: m.ranchName,
    cropName: m.cropName,
    blocks: (m.blocks ?? []).map((b) => ({ name: b.name, acreage: b.acreage })),
    rateSchedule: m.rateSchedule,
    isLegacy: m.isLegacy,
    serialCode: m.serialCode,
    status: m.status,
    powerSource: m.powerSource ?? null,
    gpm: m.gpm,
    latitude: m.latitude,
    longitude: m.longitude,
    coverageState: String(m.coverageState),
    costSource,
    modeledMonthlyCents: m.modeledMonthlyCents ?? null,
    latestBilledCents: latestBilledCentsOf(m, costSource),
    latestDemandCents: latest?.demandCents ?? null,
    latestPeakKw: latest?.peakKw ?? null,
    latestCycleClose: latest?.close ?? null,
    recentBills,
    solar: projectSolar(m, ctx),
  };
}

/** Roll up the distinct legal entities across the projected meters, most meters first (name tie-break).
 *  A meter with no entity on file is not an entity row (it shows as "Not on file" in its own meter row),
 *  matching the honest-blank contract. Pure. */
export function rollupEntities(meters: readonly ComprehensiveSnapshotMeter[]): SnapshotEntity[] {
  const byName = new Map<string, { billingName: string | null; meterCount: number }>();
  for (const m of meters) {
    if (m.entityName === null) continue;
    const prev = byName.get(m.entityName);
    if (prev) prev.meterCount += 1;
    else byName.set(m.entityName, { billingName: m.entityBillingName, meterCount: 1 });
  }
  return [...byName.entries()]
    .map(([name, v]) => ({ name, billingName: v.billingName, meterCount: v.meterCount }))
    .sort((a, b) => b.meterCount - a.meterCount || a.name.localeCompare(b.name));
}

/** Count meters by a string field into a plain record, bucketing null/blank under "(unknown)". Pure. */
function countBy(meters: readonly ComprehensiveSnapshotMeter[], pick: (m: ComprehensiveSnapshotMeter) => string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of meters) {
    const v = pick(m);
    const label = v && v.trim().length > 0 ? v : UNKNOWN_LABEL;
    out[label] = (out[label] ?? 0) + 1;
  }
  return out;
}

/** Project the farm's pending findings into the snapshot's finding shape (ALL of them, not just switches). */
export function projectFindings(findings: readonly FindingView[]): SnapshotFinding[] {
  return findings.map((f) => ({
    situation: f.situation,
    actionLabel: f.actionLabel,
    actionKind: f.actionKind ?? null,
    impactUsd: f.impactUsd,
    impactNote: f.impactNote,
    severity: f.severity,
    meterName: f.meterName,
  }));
}

/**
 * Compose the canonical snapshot from the already-extracted pieces. Ranks the opportunities by savings
 * (descending), caps to the top 5, assigns 1-based ranks + the pre-formatted display string, and sums
 * the SHOWN savings into the total (so `totals.rateSwitchSavingsCents` always equals the sum the
 * manifest can verify). The comprehensive `meters` + the farm rollups (entities, fleetSummary, findings)
 * are passed through; their defaults keep the PDF-codegen / older callers that omit them back-compatible.
 * Pure.
 */
export function composeReportSnapshot(args: {
  farm: { id: string; name: string };
  meterCount: number;
  coverageAsOf: string | null;
  latestMonthSpendCents: number | null;
  opportunities: readonly OpportunitySource[];
  /** The comprehensive per-meter records. Defaults to empty so older callers/tests are unaffected. */
  meters?: readonly ComprehensiveSnapshotMeter[];
  /** Distinct legal entities. Defaults to the rollup over `meters` when omitted. */
  entities?: readonly SnapshotEntity[];
  /** Fleet rollups. Defaults to a count-only summary derived from `meters` when omitted. */
  fleetSummary?: SnapshotFleetSummary;
  /** All pending findings. Defaults to empty when omitted. */
  findings?: readonly SnapshotFinding[];
  /** Coverage counts for the Summary tab. Default 0 (additive, back-compat). */
  coverage?: { reconciled: number; needsReview: number; noBill: number };
}): ReportSnapshot {
  const ranked = [...args.opportunities]
    .sort((a, b) => b.savingsCents - a.savingsCents)
    .slice(0, TOP_OPPORTUNITIES)
    .map(
      (o, i): SnapshotOpportunity => ({
        rank: i + 1,
        meterName: o.meterName,
        fromRate: o.fromRate,
        toRate: o.toRate,
        savingsCents: o.savingsCents,
        savingsDisplay: formatCentsUsd(o.savingsCents),
        kind: "rate_switch",
      }),
    );

  const meters = [...(args.meters ?? [])];
  const coverage = args.coverage ?? { reconciled: 0, needsReview: 0, noBill: 0 };
  const entities = args.entities ? [...args.entities] : rollupEntities(meters);
  const fleetSummary: SnapshotFleetSummary =
    args.fleetSummary ?? {
      meterCount: args.meterCount,
      bySource: countBy(meters, (m) => m.powerSource),
      byStatus: countBy(meters, (m) => m.status),
      spendDeltaCents: null,
      biggestMover: null,
    };
  return {
    farm: args.farm,
    meterCount: args.meterCount,
    coverageAsOf: args.coverageAsOf,
    totals: {
      latestMonthSpendCents: args.latestMonthSpendCents,
      rateSwitchSavingsCents: ranked.reduce((sum, o) => sum + o.savingsCents, 0),
      reconciledCount: coverage.reconciled,
      needsReviewCount: coverage.needsReview,
      noBillCount: coverage.noBill,
    },
    opportunities: ranked,
    entities,
    fleetSummary,
    findings: [...(args.findings ?? [])],
    meters,
  };
}

/**
 * Build the canonical snapshot for a farm: load the grounded meters + findings, derive the spend /
 * coverage state + the per-meter solar context with the same pure helpers the dashboard and chat use,
 * project every meter into the comprehensive record, and compose. Scope (`farmId`) is inherited from
 * `deps`, never an argument. The single read path the code-gen skill hands the sandbox.
 *
 * ZERO new Prisma queries beyond the two loaders the thin snapshot already used: the solar context, the
 * KPI strip, and the export coverage are all PURE derivations over the loaded meters.
 */
export async function buildReportSnapshot(deps: AlmondToolDeps): Promise<ReportSnapshot> {
  const [meters, findings] = await Promise.all([
    loadMetersForFarm(deps.prisma, deps.farmId),
    loadFindings(deps.prisma, deps.farmId),
  ]);
  const state = summarizeExportState(meters);
  const kpi = computeKpiStrip([...meters]);
  // Mirror the report summary section: the KPI spend counts only reconciled meters, so with none
  // reconciled there is no loaded spend to state — null, never a fabricated $0.
  const latestMonthSpendCents = state.coverage.reconciled === 0 ? null : kpi.spend.cents;

  // The per-meter solar context (shares + demand owed + grandfather) — the SAME derivation the Solar tab
  // and the chat tools read, so a generated sheet's solar figures match what Almond would answer.
  const solarByMeter = buildSolarContextByMeter(meters);

  // The comprehensive per-meter projection: every meter, fully grounded, coverage-gated exactly like the
  // dashboard table (an unreconciled meter's billed money is null, never a fabricated $0).
  const meterRecords: ComprehensiveSnapshotMeter[] = meters.map((m) =>
    projectMeter(m, solarByMeter.get(m.id)),
  );

  const fleetSummary: SnapshotFleetSummary = {
    meterCount: meters.length,
    bySource: countBy(meterRecords, (m) => m.powerSource),
    byStatus: countBy(meterRecords, (m) => m.status),
    spendDeltaCents: kpi.spend.deltaCents,
    biggestMover: kpi.biggestMover
      ? { meterName: kpi.biggestMover.meterName, deltaCents: kpi.biggestMover.deltaCents }
      : null,
  };

  return composeReportSnapshot({
    farm: { id: deps.farmId, name: deps.farmName },
    meterCount: meters.length,
    coverageAsOf: state.asOf,
    latestMonthSpendCents,
    opportunities: extractOpportunities(meters, findings),
    meters: meterRecords,
    entities: rollupEntities(meterRecords),
    fleetSummary,
    findings: projectFindings(findings),
    coverage: {
      reconciled: state.coverage.reconciled,
      needsReview: state.coverage.needsReview,
      noBill: state.coverage.noBill,
    },
  });
}
