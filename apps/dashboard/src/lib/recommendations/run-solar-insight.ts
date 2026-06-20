// The solar/NEM demand insight runner (Story 3.4, FR-15): persists the
// "solar does not cover the demand charge" explanation as a feed item for every
// meter that passes the pure gates (NEM solar + AG-C family + reconciled +
// demand owed). Mirrors run-rate-lever.ts's contract: explicit PrismaClient,
// idempotent delete-pending-then-insert scoped to SOLAR_TOOL, resolved-finding
// dedupe (a dismissed insight never resurrects), one transaction.
//
// Never run this and runEngines (the demo-interval engine) against the SAME
// farm: both own the solar tool key.

import type { Prisma, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import {
  demandUncoveredShare,
  nemDemandInsight,
  solarBillFloor,
  SOLAR_TOOL,
} from "@/lib/energy/solar-nem";
import { auditAllocation } from "@/lib/energy/solar-allocation";
import { expandTripWire } from "@/lib/energy/solar-grandfather";
import { agingArrayFlag } from "@/lib/energy/solar-degradation";
import { drEnrollment, type DrProgram } from "@/lib/energy/dr";
import { planFromLabel } from "@/lib/energy/rate-lever";
import {
  measuredAnnualHours,
  rateLegibilityFlag,
} from "@/lib/energy/solar-rate-legibility";
import { loadRateCard } from "@/lib/pge/rate-card";
import type { RateCard } from "@/lib/energy/rates";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { buildSolarDataset } from "@/lib/dashboard/solar";
import { formatUsdWhole } from "@/lib/format/money";
import { draftRecommendation } from "./build";
import type { DraftRecommendation } from "./types";

export type RunSolarInsightResult = {
  created: number;
};

/** Stable identity for an F3 aggregation finding: the meter plus the array it was scoped to (or "-"
 *  for the no-array dropped case). Used so a dismissed dropped/mismatched row never resurrects and a
 *  re-run is idempotent, the same delete-pending-then-insert + resolved-dedupe discipline as F2. */
function aggregationKey(pumpId: string, arrayId: string | null): string {
  return `${pumpId}::${arrayId ?? "-"}`;
}

/** The 1-12 calendar month of an injected ISO `asOf` (no clock read), for the dataset's next-true-up
 *  KPI. The audit itself does not depend on the month; the dataset just needs one to assemble. */
function monthOf(asOf: string): number {
  const parsed = new Date(asOf);
  const month = parsed.getUTCMonth() + 1;
  return Number.isFinite(month) ? month : 1;
}

/**
 * Run the NEM demand insight over a farm's persisted solar data and billing,
 * and persist the qualifying findings. Severity is `info` (an explanation, not
 * an action demand) and the demand dollar lives in the note, never in
 * `impactUsd` - the demand charge is money owed, not money at stake, and must
 * not inflate the rail's at-risk sum.
 */
export async function runSolarInsight(
  prisma: PrismaClient,
  farmId: string,
  asOf = "2026-06-09T12:00:00.000Z",
): Promise<RunSolarInsightResult> {
  const card = loadRateCard();
  const meters = await loadMetersForFarm(prisma, farmId);

  // Sticky responses: an insight the farmer already answered must not come back. Each emitter is
  // deduped against its own resolved identity: F2 (review_solar_demand) by pumpId; F3
  // (verify_aggregation, C-4) by the pumpId+arrayId pair the audit traced to, so dismissing one
  // dropped/mismatched row never silences another.
  const resolved = await prisma.recommendation.findMany({
    where: { farmId, tool: SOLAR_TOOL, status: { not: "pending" } },
    select: { action: true },
  });
  const resolvedPumpIds = new Set(
    resolved.flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
      return action?.kind === "review_solar_demand" &&
        typeof action.params?.pumpId === "string"
        ? [action.params.pumpId]
        : [];
    }),
  );
  const resolvedAggregationKeys = new Set(
    resolved.flatMap((r) => {
      const action = r.action as
        | { kind?: unknown; params?: { pumpId?: unknown; arrayId?: unknown } }
        | null;
      return action?.kind === "verify_aggregation" &&
        typeof action.params?.pumpId === "string" &&
        (action.params.arrayId === null || typeof action.params.arrayId === "string")
        ? [aggregationKey(action.params.pumpId, action.params.arrayId)]
        : [];
    }),
  );
  // F1 (E-3, verify_solar_schedule) dedupes by pumpId: a dismissed rate-legibility flag on a meter
  // never resurrects, the same sticky-response discipline as F2/F3.
  const resolvedSchedulePumpIds = new Set(
    resolved.flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
      return action?.kind === "verify_solar_schedule" &&
        typeof action.params?.pumpId === "string"
        ? [action.params.pumpId]
        : [];
    }),
  );
  // F4 (F-3, protect_grandfather) and F5 (F-3, investigate_array) are ARRAY-scoped findings: a
  // dismissed grandfather/aging-array note on an array never resurrects, keyed by arrayId, the same
  // sticky-response discipline as F1/F2/F3.
  const resolvedGrandfatherArrayIds = new Set(
    resolved.flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { arrayId?: unknown } } | null;
      return action?.kind === "protect_grandfather" && typeof action.params?.arrayId === "string"
        ? [action.params.arrayId]
        : [];
    }),
  );
  const resolvedAgingArrayIds = new Set(
    resolved.flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { arrayId?: unknown } } | null;
      return action?.kind === "investigate_array" && typeof action.params?.arrayId === "string"
        ? [action.params.arrayId]
        : [];
    }),
  );
  // F7 (H-4, enroll_demand_response) is a METER-scoped finding: a dismissed/done demand-response
  // routing on a meter never resurrects, keyed by pumpId, the same sticky-response discipline as F1.
  const resolvedDemandResponsePumpIds = new Set(
    resolved.flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
      return action?.kind === "enroll_demand_response" && typeof action.params?.pumpId === "string"
        ? [action.params.pumpId]
        : [];
    }),
  );

  const drafts: DraftRecommendation[] = [];
  for (const meter of meters) {
    const insight = nemDemandInsight({
      isSolar: meter.isSolar,
      scheduleLabel: meter.rateSchedule,
      coverageState: meter.coverageState,
      nemMonths: meter.nemPeriods.map((m) => ({
        start: m.start,
        netKwh: m.netKwh,
        amountCents: m.amountCents,
      })),
      cycleDemandCents: meter.periods.map((p) => p.demandCents),
      trueUpAmountCents: meter.trueUpAmountCents,
      card,
    });
    if (insight === null) continue;
    if (resolvedPumpIds.has(meter.id)) continue;

    // E-2 (FR21/FR23): the demand/service/non-bypassable floor and the uncovered
    // share, both from honest billed line items the gate already trusts (the meter
    // is reconciled, so its line items are settled). The floor is the charges solar
    // categorically does not offset; the share is the demand portion of demand +
    // offsettable energy. The share rides in the note BESIDE the dollar (never an
    // impactUsd, never a percent multiplied into a credit), and the floor breakdown
    // rides in params so the surface can render it as a labeled group, visually
    // separated from the net-metering honest-blank (FR23, the F2 contract preserved:
    // severity info, dollar in impactNote only).
    const floor = solarBillFloor(meter.periods.flatMap((p) => p.lineItems));
    const uncoveredShare = demandUncoveredShare({
      demandOwedCents: insight.demandOwedCents,
      offsettableCents: floor.offsettableCents,
    });
    const demandUsd = formatUsdWhole(insight.demandOwedCents);
    const impactNote =
      uncoveredShare !== null
        ? en.solar.insight.noteWithShare(demandUsd, Math.round(uncoveredShare * 100))
        : en.solar.insight.note(demandUsd);

    drafts.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId,
        severity: "info",
        createdAt: asOf,
        situation: en.solar.insight.situation(
          meter.name,
          en.solar.insight.positionPhrase(insight.position, insight.monthsCounted),
        ),
        impactNote,
        action: {
          kind: "review_solar_demand",
          label: en.solar.insight.action(),
          params: {
            pumpId: meter.id,
            position: insight.position,
            demandOwedCents: insight.demandOwedCents,
            netKwh: insight.netKwh,
            nemChargesCents: insight.nemChargesCents,
            monthsCounted: insight.monthsCounted,
            // E-2: the uncovered share (null when not quotable) and the floor the
            // surface renders as a labeled group. No dollar of these is a credit;
            // the net-metering credit stays honest-blank everywhere (FR10).
            uncoveredShare,
            floorCents: floor.floorCents,
            floorDemandCents: floor.demandCents,
            floorServiceCents: floor.serviceCents,
            floorNbcCents: floor.nbcCents,
          },
          execute: null,
        },
      }),
    );
  }

  // F1 (E-3, FR24/FR25): the rate-legibility flag. A solar meter on the demand-charge AG-C family
  // that measures low operating hours is a candidate for the wrong schedule, worth verifying. This is
  // a NON-dollar finding (severity watch, impactNote only, NEVER impactUsd): the priced rate-fit on a
  // solar meter is staged and the net credit obscures the underlying rate (FR25), so it never quotes a
  // $/kW or $/kWh and never enters the rail's at-risk sum. Evaluated independently of the F2 demand
  // gate: an AG-C low-hours solar meter is flag-worthy even when it carries no reconciled NEM months.
  // The hours come purely from the per-cycle totalKwh + peakKw summaries already loaded (NFR4), never
  // the interval series.
  for (const meter of meters) {
    if (resolvedSchedulePumpIds.has(meter.id)) continue;
    const hours = measuredAnnualHours({
      cycles: meter.periods.map((p) => ({
        totalKwh: p.totalKwh,
        peakKw: p.peakKw,
        start: p.start,
        close: p.close,
      })),
    });
    const flag = rateLegibilityFlag({
      isSolar: meter.isSolar,
      scheduleLabel: meter.rateSchedule,
      measuredAnnualHours: hours,
      card,
      pumpId: meter.id,
      meterName: meter.name,
    });
    if (flag === null) continue;
    drafts.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId,
        severity: "watch",
        createdAt: asOf,
        situation: en.solar.rateLegibility.situation(flag.meterName, flag.scheduleLabel),
        impactNote: en.solar.rateLegibility.note,
        action: {
          kind: "verify_solar_schedule",
          label: en.solar.rateLegibility.action(),
          params: { pumpId: flag.pumpId, scheduleLabel: flag.scheduleLabel },
          execute: null,
        },
      }),
    );
  }

  // F7 (H-4, FR30): the demand-response routing finding. F7 is NOT auto-emitted for the whole eligible
  // fleet - it is ROUTED on demand by Almond (one meter at a time) via routeDemandResponseFinding. But
  // runSolarInsight is the SOLE SOLAR_TOOL owner (ADR-S05/ARCH-A7): its finalize sweep does
  // deleteMany(pending SOLAR_TOOL) then re-inserts only its drafts, so without this the sweep would
  // WIPE a routed F7 (the sweep runs live on the statement upload and onboarding finalize). So the
  // sweep CARRIES FORWARD any already-routed pending F7 whose meter is STILL eligible (un-enrolled
  // AG-C solar), re-deriving it from the same gate so it is idempotent and stays honest-blank. A
  // routed F7 whose meter became enrolled (or whose meter vanished) is dropped - the opportunity is
  // gone, never a stale fabricated route. A resolved (done/dismissed) F7 never resurrects (keyed by
  // pumpId). This preserves "routed by Almond, owned by the sole sweep" without flooding the fleet.
  const pendingRoutedF7PumpIds = new Set(
    (
      await prisma.recommendation.findMany({
        where: { farmId, tool: SOLAR_TOOL, status: "pending" },
        select: { action: true },
      })
    ).flatMap((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
      return action?.kind === "enroll_demand_response" && typeof action.params?.pumpId === "string"
        ? [action.params.pumpId]
        : [];
    }),
  );
  for (const meter of meters) {
    if (!pendingRoutedF7PumpIds.has(meter.id)) continue; // only carry forward an ALREADY-routed F7
    if (resolvedDemandResponsePumpIds.has(meter.id)) continue; // a resolved one never resurrects
    const draft = buildDemandResponseFinding({
      farmId,
      pumpId: meter.id,
      meterName: meter.name,
      rateSchedule: meter.rateSchedule,
      isSolar: meter.isSolar,
      card,
      lineItems: meter.periods.flatMap((p) => p.lineItems),
      asOf,
    });
    if (draft === null) continue; // no longer eligible (e.g. now enrolled) -> the routed F7 drops
    drafts.push(draft);
  }

  // F3 (C-4, FR9): the allocation audit. Assemble the solar dataset (the same array-group + needs-
  // review shape the Arrays lens renders, so a finding always traces to a meter/array visible on the
  // tab), then run the pure `auditAllocation` per array. Two honest gaps:
  //   - a solar meter linked to NO array is a dropped meter (its credits reach nowhere); it traces to
  //     the meter, with arrayId null (the array it should belong to is what the grower verifies).
  //   - a recorded share diverging from the load-implied share beyond ALLOCATION_TOLERANCE_PP is a
  //     mismatch; forward-compatible (no recorded-split field in the launch data yet), so it stays
  //     silent today and is proven by the audit's unit test.
  // The dollar is ALWAYS honest-blank (impactNote only, severity watch): a "verify with PG&E" signal,
  // never money at stake, so it never inflates the rail's at-risk sum (NFR5/NFR6).
  // Pass `asOf` so the grandfather position (F-1) is measured against an injected instant, not a
  // clock; the launch fleet has no interconnection date, so every array stays honest-unknown and F4
  // emits nothing - correct, not broken.
  const dataset = buildSolarDataset(meters, monthOf(asOf), { asOf });

  // A solar meter linked to no array is a dropped meter ONLY when an aggregation graph EXISTS on the
  // farm to be dropped from (FR9): a meter absent from arrays that DO exist is a real gap to verify. A
  // farm with no arrays at all has no aggregation graph, so a lone solar meter there is not "dropped"
  // (it surfaces in the Arrays-lens needs-review tray instead, C-1) - emitting an F3 there would be a
  // false finding. So the dropped-meter audit fires only when `dataset.arrays` is non-empty.
  if (dataset.arrays.length > 0) {
    for (const m of dataset.needsReview.unlinkedMeters) {
      const key = aggregationKey(m.id, null);
      if (resolvedAggregationKeys.has(key)) continue;
      drafts.push(
        draftRecommendation({
          tool: SOLAR_TOOL,
          farmId,
          severity: "watch",
          createdAt: asOf,
          situation: en.solar.aggregation.unlinkedSituation(m.name),
          impactNote: en.solar.aggregation.note,
          action: {
            kind: "verify_aggregation",
            label: en.solar.aggregation.action(),
            params: { pumpId: m.id, arrayId: null, reason: "dropped_meter" },
            execute: null,
          },
        }),
      );
    }
  }

  // Per-array audit: dropped meters (listed-but-unlinked, scoped to the array) and mismatched recorded
  // shares. The launch data carries no listed-but-unlinked-within-an-array signal nor a recorded-split
  // field, so both pass empty today and the loop is silent - correct, not broken. The full path is
  // proven by `auditAllocation`'s unit test; this wiring emits the moment that data lands.
  for (const group of dataset.arrays) {
    const result = {
      arrayId: group.id,
      arrayName: group.name,
      shares: group.meters.map((row) => ({
        pumpId: row.pumpId,
        meterName: row.meterName,
        share: row.share,
      })),
      notOnFilePumpIds: group.meters.filter((row) => row.share === null).map((row) => row.pumpId),
    };
    const findings = auditAllocation({ result, listedButUnlinked: [] });
    const meterNameByPump = new Map(group.meters.map((row) => [row.pumpId, row.meterName]));
    const arrayName = group.name ?? en.solar.aggregation.unnamedArray;
    for (const finding of findings) {
      const key = aggregationKey(finding.pumpId, finding.arrayId);
      if (resolvedAggregationKeys.has(key)) continue;
      const meterName = meterNameByPump.get(finding.pumpId) ?? finding.pumpId;
      const situation =
        finding.kind === "dropped_meter"
          ? en.solar.aggregation.droppedSituation(meterName, arrayName)
          : en.solar.aggregation.mismatchedSituation(
              meterName,
              arrayName,
              finding.computedPct,
              finding.recordedPct,
            );
      drafts.push(
        draftRecommendation({
          tool: SOLAR_TOOL,
          farmId,
          severity: "watch",
          createdAt: asOf,
          situation,
          impactNote: en.solar.aggregation.note,
          action: {
            kind: "verify_aggregation",
            label: en.solar.aggregation.action(),
            params: { pumpId: finding.pumpId, arrayId: finding.arrayId, reason: finding.kind },
            execute: null,
          },
        }),
      );
    }
  }

  // F4 (F-3, FR16/FR17): the grandfather expiry watch. DATA-GATED on the interconnection date (DM1):
  // an array whose date is on file gets a 20-year-from-PTO countdown; an array with no date stays
  // honest-unknown and emits NOTHING. The expand trip-wire (FR17) adds the protect-what-you-have
  // framing for the NEM2 cohort. NEVER carries a dollar (impactNote only, severity watch): it is a
  // protect-the-asset signal, never money at stake, so it never inflates the rail's at-risk sum. The
  // launch fleet has no PTO date, so this loop is silent today - correct, not broken; the moment a
  // date lands it emits. A net-billing array never produces a known position (cohort isolation, FR18).
  for (const group of dataset.arrays) {
    if (group.grandfather.state !== "known") continue;
    if (resolvedGrandfatherArrayIds.has(group.id)) continue;
    const tripWire = expandTripWire({ nemType: group.nemType });
    if (!tripWire.applies) continue; // only the grandfathered NEM2 cohort has value to protect
    const arrayName = group.name ?? en.solar.grandfather.unnamedArray;
    drafts.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId,
        severity: "watch",
        createdAt: asOf,
        situation: en.solar.grandfather.situation(
          arrayName,
          group.grandfather.expiryYear,
          group.grandfather.yearsRemaining,
        ),
        impactNote: en.solar.grandfather.note,
        action: {
          kind: "protect_grandfather",
          label: en.solar.grandfather.action(),
          params: {
            arrayId: group.id,
            expiryYear: group.grandfather.expiryYear,
            yearsRemaining: group.grandfather.yearsRemaining,
          },
          execute: null,
        },
      }),
    );
  }

  // F5 (F-3, FR19/FR20): the aging-array underperformance flag. DATA-GATED on a per-array generation
  // series (DM2), which the launch export does not carry, so `agingArrayFlag` returns null and this
  // loop is SILENT (never a fabricated zero, never a guessed "healthy" state). It NEVER carries a
  // dollar (impactNote only, severity watch): the dollars-lost figure is per-site variable and not
  // honestly computable here (NFR5). The flag names its evidence window in the copy. The moment a
  // generation series and an interconnection date both land for an array, this emits.
  for (const group of dataset.arrays) {
    if (resolvedAgingArrayIds.has(group.id)) continue;
    const flag = agingArrayFlag({
      // No persisted per-array generation series at launch (DM2 absent) -> empty -> the flag is
      // null and nothing is emitted. Wired so it lights up the moment the series is persisted.
      generationByMonthKwh: [],
      nameplateKw: group.nameplateKw,
      interconnectionDate: group.interconnectionDate,
      asOf,
    });
    if (flag === null) continue;
    const arrayName = group.name ?? en.solar.aging.unnamedArray;
    drafts.push(
      draftRecommendation({
        tool: SOLAR_TOOL,
        farmId,
        severity: "watch",
        createdAt: asOf,
        situation: en.solar.aging.situation(
          arrayName,
          Math.round(flag.shortfallPct),
          flag.monthsObserved,
        ),
        impactNote: en.solar.aging.note,
        action: {
          kind: "investigate_array",
          label: en.solar.aging.action(),
          params: {
            arrayId: group.id,
            shortfallPct: flag.shortfallPct,
            monthsObserved: flag.monthsObserved,
          },
          execute: null,
        },
      }),
    );
  }

  await prisma.$transaction([
    prisma.recommendation.deleteMany({
      where: { farmId, tool: SOLAR_TOOL, status: "pending" },
    }),
    ...(drafts.length > 0
      ? [
          prisma.recommendation.createMany({
            data: drafts.map((d) => ({
              farmId: d.farmId,
              tool: d.tool,
              situation: d.situation,
              action: d.action as unknown as Prisma.InputJsonValue,
              impactUsd: d.impactUsd ?? null,
              impactNote: d.impactNote ?? null,
              severity: d.severity,
              status: d.status,
              createdAt: new Date(d.createdAt),
            })),
          }),
        ]
      : []),
  ]);

  return { created: drafts.length };
}

/**
 * F7 eligibility (H-4, FR30) - PURE. A solar meter on the demand-charge AG-C family that is NOT
 * already enrolled in a DR program (per its printed bill line items) is a candidate to ROUTE a
 * demand-response finding: DR programs pay for the evening curtailment solar cannot offset (solar is
 * nearly off when the demand peak is set). Returns false for a non-solar meter, a non-AG-C schedule,
 * or an already-enrolled meter (DR is then a fact surfaced elsewhere, never re-pitched). No dollar,
 * no clock, no I/O - just the structural gate. Almond uses this to decide whether to route F7.
 */
export function eligibleForDemandResponseRouting(args: {
  isSolar: boolean;
  rateSchedule: string | null;
  card: RateCard;
  lineItems: ReadonlyArray<{ label: string | null }>;
}): boolean {
  const { isSolar, rateSchedule, card, lineItems } = args;
  if (!isSolar) return false;
  if (rateSchedule === null) return false;
  const plan = planFromLabel(rateSchedule, card, null);
  if (plan === null || plan.family !== "AG-C") return false;
  const enrolled: DrProgram | null = drEnrollment(lineItems);
  return enrolled === null;
}

/**
 * Build the F7 demand-response routing finding for ONE eligible meter (H-4, FR30) - PURE. DISPLAY-ONLY
 * in v1 (severity `act`, shaped for later execution, `execute: null` - nothing is actually enrolled).
 * The dollar is HONEST-BLANK: the codebase carries no published DR program-rate table and NFR12
 * forbids a fabricated $/kW, so there is NO `impactUsd` and NO guessed figure - the note names the
 * opportunity only. F7 NEVER multiplies a $/kW. Returns null for an ineligible meter so a caller can
 * route unconditionally.
 */
export function buildDemandResponseFinding(args: {
  farmId: string;
  pumpId: string;
  meterName: string;
  rateSchedule: string | null;
  isSolar: boolean;
  card: RateCard;
  lineItems: ReadonlyArray<{ label: string | null }>;
  asOf?: string;
}): DraftRecommendation | null {
  const { farmId, pumpId, meterName, rateSchedule, isSolar, card, lineItems, asOf } = args;
  if (!eligibleForDemandResponseRouting({ isSolar, rateSchedule, card, lineItems })) return null;
  return draftRecommendation({
    tool: SOLAR_TOOL,
    farmId,
    severity: "act",
    createdAt: asOf ?? "2026-06-09T12:00:00.000Z",
    situation: en.solar.demandResponse.situation(meterName),
    // HONEST-BLANK dollar: no published DR rate table exists, so we name the opportunity, never a
    // figure (NFR12). impactNote only, never impactUsd - it never enters the rail's at-risk sum.
    impactNote: en.solar.demandResponse.note,
    action: {
      kind: "enroll_demand_response",
      label: en.solar.demandResponse.action(),
      // Shaped for later execution; display-only in v1, so execute stays null.
      params: { pumpId, scheduleLabel: rateSchedule },
      execute: null,
    },
  });
}

/**
 * Route (persist) the F7 demand-response finding for one meter (H-4, FR30), the explicit path Almond
 * invokes to "surface a solar finding and route a demand-response/repower finding". F7 is NOT auto-
 * emitted for the eligible fleet - it is routed here, one meter at a time, on demand. Idempotent and
 * sticky: it upserts the single pending F7 row for THIS meter (delete-pending-scoped-to-this-meter's
 * enroll_demand_response, then insert) and refuses to resurrect a resolved (done/dismissed) one, the
 * same discipline as the F1-F6 emitters - WITHOUT touching any other SOLAR_TOOL finding. Crucially, a
 * routed F7 SURVIVES a subsequent runSolarInsight: that sweep is the sole SOLAR_TOOL owner and would
 * otherwise wipe this row, so it CARRIES FORWARD an already-routed pending F7 whose meter is still
 * eligible (ADR-S05/ARCH-A7). A meter that became enrolled drops its routed F7 (the opportunity is
 * gone), and a resolved one stays resolved (both this path and the sweep dedupe against the resolved
 * set). Returns `{ created: 0 }` for an ineligible meter or a meter whose F7 the grower already
 * resolved, never a fabricated dollar.
 */
export async function routeDemandResponseFinding(
  prisma: PrismaClient,
  farmId: string,
  pumpId: string,
  asOf = "2026-06-09T12:00:00.000Z",
): Promise<RunSolarInsightResult> {
  const card = loadRateCard();
  const meter = (await loadMetersForFarm(prisma, farmId)).find((m) => m.id === pumpId);
  if (meter === undefined) return { created: 0 };

  const draft = buildDemandResponseFinding({
    farmId,
    pumpId: meter.id,
    meterName: meter.name,
    rateSchedule: meter.rateSchedule,
    isSolar: meter.isSolar,
    card,
    lineItems: meter.periods.flatMap((p) => p.lineItems),
    asOf,
  });
  if (draft === null) return { created: 0 };

  // Sticky: a resolved (done/dismissed) F7 for this meter never resurrects.
  const resolved = await prisma.recommendation.findMany({
    where: { farmId, tool: SOLAR_TOOL, status: { not: "pending" } },
    select: { action: true },
  });
  const alreadyResolved = resolved.some((r) => {
    const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
    return action?.kind === "enroll_demand_response" && action.params?.pumpId === pumpId;
  });
  if (alreadyResolved) return { created: 0 };

  // Upsert ONLY this meter's pending F7, leaving every other SOLAR_TOOL finding untouched: find the
  // existing pending F7 rows for this meter and replace them, so a re-route is idempotent.
  const pendingF7 = await prisma.recommendation.findMany({
    where: { farmId, tool: SOLAR_TOOL, status: "pending" },
    select: { id: true, action: true },
  });
  const staleIds = pendingF7
    .filter((r) => {
      const action = r.action as { kind?: unknown; params?: { pumpId?: unknown } } | null;
      return action?.kind === "enroll_demand_response" && action.params?.pumpId === pumpId;
    })
    .map((r) => r.id);

  await prisma.$transaction([
    ...(staleIds.length > 0
      ? [prisma.recommendation.deleteMany({ where: { id: { in: staleIds } } })]
      : []),
    prisma.recommendation.create({
      data: {
        farmId: draft.farmId,
        tool: draft.tool,
        situation: draft.situation,
        action: draft.action as unknown as Prisma.InputJsonValue,
        impactUsd: draft.impactUsd ?? null,
        impactNote: draft.impactNote ?? null,
        severity: draft.severity,
        status: draft.status,
        createdAt: new Date(draft.createdAt),
      },
    }),
  ]);
  return { created: 1 };
}
