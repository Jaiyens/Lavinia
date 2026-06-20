// The engine runner: the DB edge that turns Batth's stored meters, bills, and
// interval history into persisted Recommendations. Mirrors greenbutton/import.ts
// (takes a PrismaClient, no UI), the calculation engines it calls stay pure in
// src/lib/energy. Idempotent: it clears this farm's PENDING engine recs and
// re-inserts, so a re-run never duplicates and never clobbers what the farmer
// already resolved.

import type { Prisma, PrismaClient } from "@prisma/client";
import { en } from "@/copy/en";
import { bucketUsage, rateOptimization, RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { familyOf } from "@/lib/energy/rates";
import { solarNemChecks, SOLAR_TOOL } from "@/lib/energy/solar-nem";
import { retrospective, DEMAND_CHARGE_TOOL } from "@/lib/energy/retrospective";
import { billAudit, BILL_AUDIT_TOOL } from "@/lib/energy/bill-audit";
import { draftRecommendation } from "@/lib/recommendations";
import type { DraftRecommendation } from "@/lib/recommendations";
import { loadRateCard } from "@/lib/pge/rate-card";
import type { CycleBill, IntervalReading } from "@/lib/energy/types";

/** Tools this runner owns; only these are cleared/replaced on a re-run. */
const ENGINE_TOOLS = [
  RATE_OPTIMIZATION_TOOL,
  SOLAR_TOOL,
  DEMAND_CHARGE_TOOL,
  BILL_AUDIT_TOOL,
];

const LEGACY_FAMILIES = new Set(["AG-4", "AG-5"]);

function isAg(schedule: string | null): boolean {
  return schedule !== null && schedule.trim().toUpperCase().startsWith("AG");
}

/** Date-only ISO so the engine's bucket window matches how the bills were derived. */
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type RunEnginesResult = {
  created: number;
  byTool: Record<string, number>;
};

/**
 * Run every recommendation engine over a farm's data and persist the findings.
 * Rate optimization runs on ag meters with interval history (so the bill-reproduction
 * check has something to reconcile); solar/NEM runs on solar-paired meters; legacy
 * meters without enough history are rolled into one "still on a closed rate" finding.
 */
export async function runEngines(
  prisma: PrismaClient,
  farmId: string,
  asOf = "2026-06-04T12:00:00.000Z",
): Promise<RunEnginesResult> {
  const card = loadRateCard();
  const farm = await prisma.farm.findUniqueOrThrow({
    where: { id: farmId },
    select: { timezone: true },
  });
  const tz = farm.timezone;

  // Load only the per-pump metadata + the (small) per-cycle billing periods with their
  // line items up front, NOT every pump's 15-minute interval history at once: a 183-meter
  // farm with a year of intervals each is millions of rows and OOMs node if loaded
  // together. Each pump's intervals are streamed one meter at a time below, so peak memory
  // is one meter's series, not the farm's.
  const pumps = await prisma.pump.findMany({
    where: { farmId },
    select: {
      id: true,
      name: true,
      rateSchedule: true,
      solarKw: true,
      nemType: true,
      trueUpMonth: true,
      billingPeriods: {
        select: {
          start: true,
          close: true,
          tariff: true,
          demandChargeUsd: true,
          peakKw: true,
          peakAt: true,
          totalBillUsd: true,
          printedTotalCents: true,
          billingLineItems: { select: { kind: true, amountCents: true } },
        },
      },
    },
  });

  const drafts: DraftRecommendation[] = [];
  const legacyWithoutFinding: string[] = [];

  for (const pump of pumps) {
    // Per-pump engines are wrapped: one meter's engine throwing (a malformed cycle, a bad
    // tz conversion, a pricing edge) must never abort the whole run and strand the farm
    // with zero findings. The bad meter is logged and skipped; the rest still produce recs.
    try {
      const bills: CycleBill[] = pump.billingPeriods.map((b) => {
        // Money totals: a real Green Button/UtilityAPI cycle carries totalBillUsd; a
        // bill-PDF cycle (the extractor) carries only printedTotalCents. Read either so a
        // real farm is not left with $0 totals (every lever would then skip). Likewise the
        // demand charge: prefer the float, else sum the cents of the demand line items.
        const totalBillUsd =
          b.totalBillUsd ??
          (b.printedTotalCents != null ? b.printedTotalCents / 100 : null);
        const demandLineCents = b.billingLineItems
          .filter((li) => li.kind === "demand")
          .reduce((sum, li) => sum + li.amountCents, 0);
        const demandChargeUsd =
          b.demandChargeUsd ?? (demandLineCents > 0 ? demandLineCents / 100 : null);
        return {
          start: dateOnly(b.start),
          close: dateOnly(b.close),
          tariff: b.tariff,
          demandChargeUsd,
          peakKw: b.peakKw,
          peakAt: b.peakAt ? b.peakAt.toISOString() : null,
          totalBillUsd,
        };
      });

      // Stream this one pump's interval history (the OOM source if loaded for all pumps).
      const rawIntervals = await prisma.usageInterval.findMany({
        where: { pumpId: pump.id },
        orderBy: { start: "asc" },
        select: { start: true, durationSec: true, kWh: true },
      });
      const intervals: IntervalReading[] = rawIntervals.map((iv) => ({
        start: iv.start.toISOString(),
        durationSec: iv.durationSec,
        kWh: iv.kWh,
      }));
      const actualAnnualBillUsd = bills.reduce(
        (sum, b) => sum + (b.totalBillUsd ?? 0),
        0,
      );

      // Rate optimization: ag meters with real interval history. Solar-paired meters
      // are excluded, their NEM economics net generation against use, which this
      // gross-consumption model does not capture, so a rate-switch dollar claim there
      // would be unreliable. The solar/NEM checks below speak for those meters instead.
      let emittedRateRec = false;
      if (
        pump.rateSchedule &&
        isAg(pump.rateSchedule) &&
        intervals.length > 0 &&
        pump.solarKw === null
      ) {
        const profile = bucketUsage(intervals, bills, tz, card);
        const res = rateOptimization({
          farmId,
          pumpId: pump.id,
          pumpName: pump.name,
          currentSchedule: pump.rateSchedule,
          profile,
          actualAnnualBillUsd,
          card,
          asOf,
        });
        if (res.recommendation) {
          drafts.push(res.recommendation);
          emittedRateRec = true;
        }
      }

      // A legacy meter we couldn't price precisely yet: roll into the fleet finding.
      if (
        pump.rateSchedule &&
        LEGACY_FAMILIES.has(familyOf(pump.rateSchedule)) &&
        !emittedRateRec
      ) {
        legacyWithoutFinding.push(pump.id);
      }

      // Demand-charge exposure: a single mistimed peak day that drove a cycle's demand
      // charge. Metered, non-solar pumps only (solar speaks through the solar checks).
      // The pure lever emits one rec per demand cycle; we keep only the actionable
      // outliers (a clear avoidable spike) and re-tag them to the demand-charge category.
      if (intervals.length > 0 && pump.solarKw === null) {
        const demandRecs = retrospective({
          farmId,
          pumpId: pump.id,
          pumpName: pump.name,
          timezone: tz,
          intervals,
          bills,
          asOf,
          outlierSeverity: "act",
        });
        for (const rec of demandRecs) {
          const peakDay = (rec.action.params as { peakDay?: unknown } | undefined)?.peakDay;
          if (typeof peakDay !== "string") continue; // no outlier: a flat demand month, skip
          drafts.push({ ...rec, tool: DEMAND_CHARGE_TOOL });
        }
      }

      // Bill audit: a posted cycle higher than the meter's usual, with usage flat. Runs
      // on every pump with bills; the lever's own gates keep it quiet for flat meters.
      drafts.push(
        ...billAudit({
          farmId,
          pumpId: pump.id,
          pumpName: pump.name,
          bills,
          summerMonths: card.summerMonths,
          asOf,
        }),
      );

      // Solar / NEM checks: solar-paired meters only.
      if (pump.solarKw !== null) {
        drafts.push(
          ...solarNemChecks({
            farmId,
            pumpId: pump.id,
            pumpName: pump.name,
            timezone: tz,
            nemType: pump.nemType,
            trueUpMonth: pump.trueUpMonth,
            solarKw: pump.solarKw,
            bills,
            asOf,
          }),
        );
      }
    } catch (err) {
      // One meter's engines failing must not lose the whole run: log (pump id only, never
      // grower data) and continue so the farm still lands the findings from its other meters.
      console.error(
        `runEngines: meter ${pump.id} engines failed and were skipped`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // One aggregate finding for the legacy-rate meters still awaiting a full check.
  if (legacyWithoutFinding.length > 0) {
    drafts.push(
      draftRecommendation({
        tool: RATE_OPTIMIZATION_TOOL,
        farmId,
        severity: "watch",
        createdAt: asOf,
        situation: en.rateOptimization.legacyFleet.situation(legacyWithoutFinding.length),
        impactNote: en.rateOptimization.legacyFleet.note(),
        action: {
          kind: "review_legacy_fleet",
          label: en.rateOptimization.legacyFleet.action(),
          params: { pumpIds: legacyWithoutFinding, count: legacyWithoutFinding.length },
          execute: null,
        },
      }),
    );
  }

  await prisma.recommendation.deleteMany({
    where: { farmId, tool: { in: ENGINE_TOOLS }, status: "pending" },
  });
  await prisma.recommendation.createMany({
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
  });

  const byTool: Record<string, number> = {};
  for (const d of drafts) byTool[d.tool] = (byTool[d.tool] ?? 0) + 1;
  return { created: drafts.length, byTool };
}
