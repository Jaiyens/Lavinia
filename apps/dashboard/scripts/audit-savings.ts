// READ-ONLY full-suite savings audit. Runs every savings engine across every meter
// on a farm and reports the real opportunity by category - rate optimization
// (annualized, interval-based) at several reconciliation bands, the per-billed-period
// rate lever, demand-charge exposure, and bill-audit disputes. Writes NOTHING. Every
// figure is the deterministic engine's own, reconciled against the real bills; this
// audit only sums and reports, it never invents or adjusts a dollar.
//
//   DATABASE_URL=postgresql://USER@127.0.0.1:5432/terra_batth tsx scripts/audit-savings.ts <farmId>

import { PrismaClient } from "@prisma/client";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { loadRateCard } from "@/lib/pge/rate-card";
import { bucketUsage, rateOptimization } from "@/lib/energy/rate-compare";
import { rateLever } from "@/lib/energy/rate-lever";
import { retrospective } from "@/lib/energy/retrospective";
import { billAudit } from "@/lib/energy/bill-audit";
import { familyOf } from "@/lib/energy/rates";
import { isSolarNemMeter } from "@/lib/energy/solar-meter";
import type { CycleBill, IntervalReading } from "@/lib/energy/types";

function isAg(schedule: string | null): boolean {
  if (!schedule) return false;
  const f = familyOf(schedule);
  return f.startsWith("AG-");
}
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function usdFromDollars(d: number): string {
  return `$${Math.round(d).toLocaleString("en-US")}`;
}

async function main(): Promise<void> {
  const farmId = process.argv[2];
  if (!farmId) throw new Error("usage: tsx scripts/audit-savings.ts <farmId>");
  const prisma = new PrismaClient();
  try {
    const card = loadRateCard();
    const farm = await prisma.farm.findUniqueOrThrow({
      where: { id: farmId },
      select: { timezone: true, name: true },
    });
    const tz = farm.timezone;
    const meters = await loadMetersForFarm(prisma, farmId);

    // Category accumulators (all in the engines' own units).
    let rateOpt3 = 0, rateOpt5 = 0; // annualized $ (interval rate-opt)
    let rateOpt3_n = 0, rateOpt5_n = 0;
    let leverPeriodCents = 0, lever_n = 0; // per-billed-period cents (bills lever)
    let demandCents = 0, demand_n = 0;
    let billAuditUsd = 0, billAudit_n = 0;
    let reconciledNonSolar = 0, withIntervals = 0;

    const topRateOpt: { name: string; annualUsd: number; from: string; to: string; reproPct: number }[] = [];
    const topDemand: { name: string; cents: number }[] = [];
    const topAudit: { name: string; usd: number; note: string }[] = [];

    for (const m of meters) {
      if (m.coverageState !== "reconciled" || isSolarNemMeter(m)) continue;
      reconciledNonSolar++;

      const bills: CycleBill[] = m.periods.map((p) => {
        const demandLineCents = p.lineItems
          .filter((li) => li.kind === "demand")
          .reduce((s, li) => s + li.amountCents, 0);
        return {
          start: dateOnly(new Date(p.start)),
          close: dateOnly(new Date(p.close)),
          tariff: p.tariff,
          demandChargeUsd: p.demandCents != null ? p.demandCents / 100 : demandLineCents > 0 ? demandLineCents / 100 : null,
          peakKw: p.peakKw,
          peakAt: null,
          totalBillUsd: p.printedTotalCents != null ? p.printedTotalCents / 100 : null,
        };
      });
      const actualAnnualBillUsd = bills.reduce((s, b) => s + (b.totalBillUsd ?? 0), 0);

      const rawIntervals = await prisma.usageInterval.findMany({
        where: { pumpId: m.id },
        orderBy: { start: "asc" },
        select: { start: true, durationSec: true, kWh: true },
      });
      const intervals: IntervalReading[] = rawIntervals.map((iv) => ({
        start: iv.start.toISOString(),
        durationSec: iv.durationSec,
        kWh: iv.kWh,
      }));
      if (intervals.length > 0) withIntervals++;

      // --- Interval-based rate optimization (ANNUALIZED), at 3% and 5% bands ---
      if (m.rateSchedule && isAg(m.rateSchedule) && intervals.length > 0) {
        const profile = bucketUsage(intervals, bills, tz, card);
        for (const tol of [0.03, 0.05] as const) {
          const res = rateOptimization({
            farmId, pumpId: m.id, pumpName: m.name, currentSchedule: m.rateSchedule,
            profile, actualAnnualBillUsd, card, asOf: "2026-06-23T12:00:00.000Z", tolerance: tol,
          });
          if (res.recommendation && res.savingsUsd > 0 && res.withinTolerance) {
            if (tol === 0.03) {
              rateOpt3 += res.savingsUsd; rateOpt3_n++;
              topRateOpt.push({ name: m.name, annualUsd: res.savingsUsd, from: res.currentSchedule, to: res.bestSchedule ?? "?", reproPct: res.reproductionError * 100 });
            } else {
              rateOpt5 += res.savingsUsd; rateOpt5_n++;
            }
          }
        }
      }

      // --- Per-billed-period rate lever (the conservative bills-based figure) ---
      const lev = rateLever({ scheduleLabel: m.rateSchedule, periods: m.periods }, card);
      if (lev.kind === "estimate") { leverPeriodCents += lev.savingsCents; lever_n++; }

      // --- Demand-charge exposure ---
      if (intervals.length > 0) {
        const recs = retrospective({ farmId, pumpId: m.id, pumpName: m.name, timezone: tz, intervals, bills, asOf: "2026-06-23T12:00:00.000Z", outlierSeverity: "act" });
        for (const r of recs) {
          const c = Math.round((r.impactUsd ?? 0) * 100);
          if (c > 0) { demandCents += c; demand_n++; topDemand.push({ name: m.name, cents: c }); }
        }
      }

      // --- Bill audit (disputes) ---
      const audits = billAudit({ farmId, pumpId: m.id, pumpName: m.name, bills, summerMonths: card.summerMonths, asOf: "2026-06-23T12:00:00.000Z" });
      for (const a of audits) {
        if ((a.impactUsd ?? 0) > 0) { billAuditUsd += a.impactUsd ?? 0; billAudit_n++; topAudit.push({ name: m.name, usd: a.impactUsd ?? 0, note: a.situation }); }
      }
    }

    topRateOpt.sort((a, b) => b.annualUsd - a.annualUsd);
    topDemand.sort((a, b) => b.cents - a.cents);
    topAudit.sort((a, b) => b.usd - a.usd);

    console.log("");
    console.log(`FULL SAVINGS AUDIT - ${farm.name} (${farmId})`);
    console.log("=".repeat(64));
    console.log(`meters: ${reconciledNonSolar} reconciled non-solar, ${withIntervals} with interval data`);
    console.log("");
    console.log("RATE OPTIMIZATION (interval-based, ANNUALIZED):");
    console.log(`  @ 3% band: ${usdFromDollars(rateOpt3)}/yr across ${rateOpt3_n} meters`);
    console.log(`  @ 5% band: ${usdFromDollars(rateOpt5)}/yr across ${rateOpt5_n} meters`);
    console.log(`  bills-lever (per billed period, 3%): ${usd(leverPeriodCents)} across ${lever_n} meters  [x12 ~= ${usd(leverPeriodCents * 12)}/yr if every month repeats]`);
    console.log("");
    console.log(`DEMAND-CHARGE EXPOSURE (avoidable spikes): ${usd(demandCents)} across ${demand_n} cycles`);
    console.log(`BILL-AUDIT DISPUTES: ${usdFromDollars(billAuditUsd)} across ${billAudit_n} findings`);
    console.log("");
    console.log("top rate-opt (annualized @3%):");
    for (const t of topRateOpt.slice(0, 10)) console.log(`  ${usdFromDollars(t.annualUsd)}/yr  ${t.name}  ${t.from}->${t.to}  (repro ${t.reproPct.toFixed(1)}%)`);
    console.log("top demand-charge:");
    for (const t of topDemand.slice(0, 8)) console.log(`  ${usd(t.cents)}  ${t.name}`);
    console.log("top bill-audit:");
    for (const t of topAudit.slice(0, 8)) console.log(`  ${usdFromDollars(t.usd)}  ${t.name}  ${t.note.slice(0, 70)}`);
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[audit] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
