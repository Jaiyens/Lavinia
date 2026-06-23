// Persist the full-history rate-switch savings as Recommendation rows (LOCAL DB only).
// Confirmed meters (bill reconciles, limiter-correct, AG-B eligible) become billable
// dollar findings; pending-reconcile meters become review-only findings with NO dollar
// (real usage, but the bill is not yet validated, so we never bill on them). Idempotent:
// replaces this farm's PENDING rate-optimization recs in one transaction; never touches
// resolved ones or other tools. Hard local-DB guard - refuses any non-local DATABASE_URL.
//
//   DATABASE_URL=postgresql://USER@127.0.0.1:5432/terra_batth tsx scripts/persist-full-history-savings.ts <farmId>

import { PrismaClient, type Prisma } from "@prisma/client";
import { computeFullHistorySavings, type MeterSaving } from "@/lib/recommendations/full-history-savings";
import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";

function assertLocalDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error("REFUSING TO RUN: DATABASE_URL is not local (127.0.0.1/localhost). This persist is local-only.");
  }
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** A grower-facing recommendation row. No em dashes in copy (localization rule). */
function recForSaving(farmId: string, s: MeterSaving, asOf: Date) {
  const pdpNote = s.pdpFlag
    ? " This meter peaks above 200 kW, so confirm it is not defaulted onto Peak Day Pricing before filing."
    : "";
  if (s.status === "confirmed") {
    return {
      farmId,
      tool: RATE_OPTIMIZATION_TOOL,
      situation: `${s.name} can move from ${s.fromSchedule} to ${s.toSchedule} and save about ${usd(s.annualSavingsCents)} a year.`,
      action: {
        kind: "switch_rate",
        label: `Move ${s.name} to ${s.toSchedule}`,
        params: {
          pumpId: s.pumpId,
          from: s.fromSchedule,
          to: s.toSchedule,
          savingsCents: s.annualSavingsCents,
          basis: "full_history_12mo",
          reconciled: true,
          observedPeakKw: s.observedPeakKw,
          pdpFlag: s.pdpFlag,
        },
        execute: null,
      } as unknown as Prisma.InputJsonValue,
      impactUsd: s.annualSavingsCents / 100,
      impactNote: `Estimated from 12 months of this meter's metered usage priced on PG&E's published ${s.toSchedule} versus ${s.fromSchedule} rates, with the AG-C demand-charge limiter applied. This meter's printed bill reconciles to the rate card within 3 percent, so the figure is defensible.${pdpNote}`,
      severity: "act",
      status: "pending",
      createdAt: asOf,
    };
  }
  return {
    farmId,
    tool: RATE_OPTIMIZATION_TOOL,
    situation: `${s.name} shows a possible move from ${s.fromSchedule} to ${s.toSchedule}, pending bill confirmation.`,
    action: {
      kind: "review_rate",
      label: `Review ${s.name} for ${s.toSchedule}`,
      params: {
        pumpId: s.pumpId,
        from: s.fromSchedule,
        to: s.toSchedule,
        potentialSavingsCents: s.annualSavingsCents,
        basis: "full_history_12mo",
        reason: "pending_reconcile",
      },
      execute: null,
    } as unknown as Prisma.InputJsonValue,
    impactUsd: null,
    impactNote: `Real usage suggests about ${usd(s.annualSavingsCents)} a year, but this meter's bill does not yet reconcile to the rate card within 3 percent (often the March 1 rate change). Load 2 to 3 more full billing cycles to confirm before billing.`,
    severity: "watch",
    status: "pending",
  };
}

async function main(): Promise<void> {
  assertLocalDb();
  const farmId = process.argv[2];
  if (!farmId) throw new Error("usage: tsx scripts/persist-full-history-savings.ts <farmId>");
  const prisma = new PrismaClient();
  try {
    const r = await computeFullHistorySavings(prisma, farmId);
    const asOf = new Date();
    const rows = r.results.map((s) => recForSaving(farmId, s, asOf));
    const confirmed = r.results.filter((s) => s.status === "confirmed");
    const confCents = confirmed.reduce((sum, s) => sum + s.annualSavingsCents, 0);

    await prisma.$transaction([
      prisma.recommendation.deleteMany({ where: { farmId, tool: RATE_OPTIMIZATION_TOOL, status: "pending" } }),
      prisma.recommendation.createMany({
        data: rows.map((row) => ({
          farmId: row.farmId,
          tool: row.tool,
          situation: row.situation,
          action: row.action,
          impactUsd: row.impactUsd,
          impactNote: row.impactNote,
          severity: row.severity,
          status: row.status,
          ...(row.createdAt ? { createdAt: row.createdAt } : {}),
        })),
      }),
    ]);

    console.log(
      `[persist] ${r.farmName}: wrote ${rows.length} rate-optimization recs ` +
        `(${confirmed.length} confirmed billable = ${usd(confCents)}/yr, fee ${usd(confCents * 0.2)}; ` +
        `${rows.length - confirmed.length} pending-reconcile review-only). Replaced prior pending rate-opt recs.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[persist] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
