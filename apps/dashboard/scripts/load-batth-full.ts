// One-shot, idempotent loader: lands the FULL verified Batth dataset onto a real owned
// farm in LOCAL Postgres — master metadata + 12 months of 15-min intervals + reconciled
// bills for all 5 billed accounts — then computes modeled cost and runs the finding engines.
//
// Reuses the tested pipeline end to end (seedBatthRealFarm, importMeters, persistExtraction,
// modelMeterCost, runEngines); adds no logic to those. The only new behavior here is the
// orchestration + the spine/off-spine split + the modeled-cost precompute.
//
// SAFETY: refuses to run unless DATABASE_URL points at a local Postgres (terra_batth). A real
// grower's savings ride on this data, so it never silently writes a remote/prod database.
//
// Run:
//   DATABASE_URL=postgresql://panda@127.0.0.1:5432/terra_batth \
//   DATABASE_URL_UNPOOLED=postgresql://panda@127.0.0.1:5432/terra_batth \
//   NODE_OPTIONS=--max-old-space-size=6144 \
//   npx tsx scripts/load-batth-full.ts

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { seedBatthRealFarm } from "../prisma/batth-real-farm";
import { normalizeDownloadMyDataCsv } from "@/lib/normalize/downloadmydata";
import { importMeters } from "@/lib/greenbutton/import";
import { persistExtraction } from "@/lib/extract/import";
import { modelMeterCost } from "@/lib/energy/modeled-cost";
import { loadRateCard } from "@/lib/pge/rate-card";
import { runEngines } from "@/lib/recommendations/run";
import { reconcileFarm } from "./reconcile-batth";

const OWNER_EMAIL = "gpt4shared@gmail.com";
const FARM_NAME = "Batth Farms";
const REPO_ROOT = "/Users/panda/Lavinia";
const CSV_DIR = join(REPO_ROOT, "BatthData");
const BILLS_DIR = join(REPO_ROOT, "batth-ingestion/extracted/bills");
const REPORTS_DIR = join(REPO_ROOT, "batth-ingestion/reports");
const AGG_PATH = join(REPO_ROOT, "batth-ingestion/dist/interval_aggregates.json");

function log(msg: string): void {
  console.log(msg);
}

/** PG&E NEM months print only the period END (close); the start is null. Derive start ~= close
 *  minus one month so the row persists AND buckets to the same calendar month the account's
 *  fuller statement uses (which prints real starts), so the two never double-count. */
function minusOneMonthIso(closeIso: string): string {
  const d = new Date(`${closeIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fill null NEM month starts from close; leave real starts (incl. OCR-noisy) untouched. */
function sanitizeNem(nem: Array<{ months?: Array<{ start: string | null; close: string | null }> }>): unknown[] {
  return nem.map((e) => ({
    ...e,
    months: (e.months ?? []).map((m) => ({
      ...m,
      start: m.start ?? (m.close ? minusOneMonthIso(m.close) : null),
    })),
  }));
}

/** Hard guard: only ever write a local Postgres. */
function assertLocalDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /(127\.0\.0\.1|localhost)/.test(url) && /terra_batth/.test(url);
  if (!isLocal) {
    throw new Error(
      `REFUSING TO RUN: DATABASE_URL is not the local terra_batth DB.\n` +
        `Set DATABASE_URL=postgresql://panda@127.0.0.1:5432/terra_batth before running.`,
    );
  }
  log(`[safety] DATABASE_URL -> local terra_batth: OK`);
}

async function main(): Promise<void> {
  assertLocalDb();
  const prisma = new PrismaClient();
  const card = loadRateCard();
  const summary: Record<string, unknown> = { generated: "2026-06-22" };

  // ---- Idempotent cleanup: drop any prior Batth farm (demo or real) so a re-run is clean.
  const del = await prisma.farm.deleteMany({ where: { name: FARM_NAME } });
  log(`[cleanup] removed ${del.count} prior "${FARM_NAME}" farm(s) (cascade)`);

  // ===================================================================================
  // G1 — owned farm: metadata + arrays + 4699664587 bills, then make it real + owned.
  // ===================================================================================
  log(`\n=== G1: seed metadata + arrays + bills, make owned ===`);
  const seeded = await seedBatthRealFarm(prisma);
  const farmId = seeded.id;
  log(`[G1] seedBatthRealFarm: pumps=${seeded.pumpsCreated} billingPeriods=${seeded.billingPeriods} ` +
    `entities=${seeded.entities} arrays=${seeded.arrays} nemPeriods=${seeded.nemPeriodsCreated}`);

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: "Batth (owner)" },
  });
  await prisma.farm.update({ where: { id: farmId }, data: { isDemo: false, userId: owner.id } });
  await prisma.farmMembership.upsert({
    where: { farmId_userId: { farmId, userId: owner.id } },
    update: { role: "owner", status: "active" },
    create: { farmId, userId: owner.id, role: "owner", status: "active" },
  });
  log(`[G1] owned by ${OWNER_EMAIL} (isDemo=false, FarmMembership owner/active)`);

  // Capture the spine set ONCE (the seeded master meters) — fixed for all 12 CSVs.
  const seedPumps = await prisma.pump.findMany({ where: { farmId }, select: { serviceId: true, rateSchedule: true } });
  const spineSet = new Set(seedPumps.map((p) => p.serviceId).filter((s): s is string => !!s));
  const masterRate = new Map(seedPumps.filter((p) => p.serviceId).map((p) => [p.serviceId as string, p.rateSchedule]));
  log(`[G1] spine = ${spineSet.size} seeded master meters`);

  // ===================================================================================
  // G2 — intervals: 12 CSVs. Spine meters keep curated rate (null feed tariff); off-spine
  // kept + tagged. Modeled cost priced per month from the in-memory intervals.
  // ===================================================================================
  log(`\n=== G2: import 12 interval CSVs ===`);
  const csvFiles = readdirSync(CSV_DIR)
    .filter((f) => f.startsWith("Historical_") && f.endsWith(".csv"))
    .sort();
  log(`[G2] ${csvFiles.length} canonical CSVs`);

  const offSpine = new Set<string>();
  const modeledSum = new Map<string, number>(); // serviceId -> sum monthlyCents
  const modeledCnt = new Map<string, number>();
  const rateDisagree: Array<{ serviceId: string; master: string | null; feed: string | null }> = [];
  const seenDisagree = new Set<string>();
  let totalIntervals = 0;

  for (const file of csvFiles) {
    const content = readFileSync(join(CSV_DIR, file), "utf8");
    const meters = normalizeDownloadMyDataCsv(content);

    // Price this month (real feed rate), accumulate modeled monthly cents per meter.
    for (const m of meters) {
      const mc = modelMeterCost(m.serviceId, m.tariff, m.intervals, card);
      if (mc.priced) {
        modeledSum.set(m.serviceId, (modeledSum.get(m.serviceId) ?? 0) + mc.monthlyCents);
        modeledCnt.set(m.serviceId, (modeledCnt.get(m.serviceId) ?? 0) + 1);
      }
      // Record any feed-vs-master rate disagreement for the report (spine meters only).
      if (spineSet.has(m.serviceId) && m.tariff && !seenDisagree.has(m.serviceId)) {
        const master = masterRate.get(m.serviceId) ?? null;
        if (master && master.replace(/[^a-z0-9]/gi, "").toUpperCase() !== m.tariff.replace(/[^a-z0-9]/gi, "").toUpperCase()) {
          rateDisagree.push({ serviceId: m.serviceId, master, feed: m.tariff });
          seenDisagree.add(m.serviceId);
        }
      }
    }

    // Split: spine (preserve curated rate -> null feed tariff) vs off-spine (keep + tag).
    const spine = [];
    const off = [];
    for (const m of meters) {
      if (spineSet.has(m.serviceId)) {
        spine.push({ ...m, tariff: null });
      } else {
        offSpine.add(m.serviceId);
        off.push(m);
      }
    }
    const rSpine = await importMeters(prisma, { meters: spine, farmId, source: "download_my_data" });
    const rOff = off.length ? await importMeters(prisma, { meters: off, farmId, source: "download_my_data" }) : { intervals: 0 } as { intervals: number };
    totalIntervals += rSpine.intervals + (rOff.intervals ?? 0);
    log(`[G2] ${file}: meters=${meters.length} spine=${spine.length} off=${off.length} intervals+=${rSpine.intervals + (rOff.intervals ?? 0)}`);
  }
  log(`[G2] total intervals landed: ${totalIntervals} | off-spine SAs: ${offSpine.size} | rate disagreements: ${rateDisagree.length}`);

  // Tag off-spine pumps so they read as "needs a master-list entry", never silently hidden.
  if (offSpine.size) {
    const tagged = await prisma.pump.updateMany({
      where: { farmId, serviceId: { in: [...offSpine] } },
      data: { status: "UNMAPPED" },
    });
    // Names individually (updateMany can't template per-row).
    for (const sid of offSpine) {
      await prisma.pump.updateMany({ where: { farmId, serviceId: sid }, data: { name: `Unmapped SA ${sid}` } });
    }
    log(`[G2] tagged ${tagged.count} off-spine pumps as UNMAPPED`);
  }

  // ===================================================================================
  // G3 — bills: persist all 7 reconciled extracts (5 accounts) with detailed line items.
  // ===================================================================================
  log(`\n=== G3: persist reconciled bills (5 accounts) ===`);
  const billFiles = readdirSync(BILLS_DIR).filter((f) => f.endsWith(".json")).sort();
  let billAccounts = 0;
  for (const bf of billFiles) {
    const j = JSON.parse(readFileSync(join(BILLS_DIR, bf), "utf8"));
    const result = {
      pages: j.pages ?? 0,
      accountNumber: j.account?.number ?? null,
      accountPrintedTotalCents: j.account?.printedTotalCents ?? null,
      bills: j.bills ?? [],
      nem: sanitizeNem(j.nem ?? []),
      needsReview: j.needsReview ?? [],
      reconciledCount: j.reconciledCount ?? 0,
      escalatedCount: j.escalatedCount ?? 0,
    };
    if (!result.accountNumber) {
      log(`[G3] SKIP ${bf}: no account number`);
      continue;
    }
    try {
      const out = await persistExtraction(result as Parameters<typeof persistExtraction>[0], prisma, {
        farmName: FARM_NAME,
        accountNumber: result.accountNumber,
        isDemo: false,
        farmId,
      });
      billAccounts += 1;
      log(`[G3] ${bf} (acct ${result.accountNumber}): pumps=${out.pumps} periods=${out.periods} lineItems=${out.lineItems}`);
    } catch (e) {
      log(`[G3] ERROR on ${bf}: ${(e as Error).message} — skipped, continuing`);
    }
  }

  // ===================================================================================
  // G4 — classify: persist averaged modeled monthly cents on metered pumps.
  // ===================================================================================
  log(`\n=== G4: modeled cost classification ===`);
  let modeledWritten = 0;
  for (const [sid, sum] of modeledSum) {
    const cnt = modeledCnt.get(sid) ?? 1;
    const cents = Math.round(sum / cnt);
    const r = await prisma.pump.updateMany({ where: { farmId, serviceId: sid }, data: { modeledMonthlyCents: cents } });
    modeledWritten += r.count;
  }
  log(`[G4] modeledMonthlyCents written on ${modeledWritten} metered pumps`);

  // ===================================================================================
  // G4.5 — legacy flag: the fixture never set isLegacy, so the closed AG-4/AG-5 schedules
  // were not exempted and leaked into individual rate-optimization $ findings (the engine
  // rolls legacy meters into one "still on a closed rate" watch finding instead). Set it
  // BEFORE the engines run so the suppression fires.
  // ===================================================================================
  const allRated = await prisma.pump.findMany({
    where: { farmId, rateSchedule: { not: null } },
    select: { id: true, rateSchedule: true },
  });
  const legacyIds = allRated.filter((p) => /AG-?[45]/i.test(p.rateSchedule ?? "")).map((p) => p.id);
  if (legacyIds.length) {
    await prisma.pump.updateMany({ where: { id: { in: legacyIds } }, data: { isLegacy: true } });
  }
  log(`[G4.5] flagged ${legacyIds.length} AG-4/AG-5 meters isLegacy=true`);

  // ===================================================================================
  // G5 — engines.
  // ===================================================================================
  log(`\n=== G5: run finding engines ===`);
  const eng = await runEngines(prisma, farmId);
  log(`[G5] recommendations created: ${eng.created} | byTool: ${JSON.stringify(eng.byTool)}`);

  // ===================================================================================
  // G6 — reconcile: protect accuracy (suppress P031/NEM bill-audit + unmapped findings) and
  // legibility (merge fragmented Account rows into one per real PG&E account).
  // ===================================================================================
  log(`\n=== G6: reconcile (finding suppression + account merge) ===`);
  const rec = await reconcileFarm(prisma, farmId);
  log(`[G6] ${JSON.stringify(rec)}`);
  Object.assign(summary, { reconcile: rec });

  // ---- Final tally + load report
  const counts = {
    pumps: await prisma.pump.count({ where: { farmId } }),
    pumpsUnmapped: await prisma.pump.count({ where: { farmId, status: "UNMAPPED" } }),
    intervals: await prisma.usageInterval.count({ where: { pump: { farmId } } }),
    billingPeriods: await prisma.billingPeriod.count({ where: { pump: { farmId } } }),
    reconciledPumps: await prisma.pump.count({ where: { farmId, coverageState: "reconciled" } }),
    needsReviewPumps: await prisma.pump.count({ where: { farmId, coverageState: "needs_review" } }),
    modeledPumps: await prisma.pump.count({ where: { farmId, modeledMonthlyCents: { not: null }, coverageState: { not: "reconciled" } } }),
    recommendations: await prisma.recommendation.count({ where: { farmId } }),
    accounts: await prisma.account.count({ where: { farmId } }),
    solarArrays: await prisma.solarArray.count({ where: { farmId } }),
  };
  log(`\n=== TALLY ===\n${JSON.stringify(counts, null, 1)}`);

  Object.assign(summary, {
    farmId,
    owner: OWNER_EMAIL,
    counts,
    offSpineSAs: [...offSpine].sort(),
    rateDisagreements: rateDisagree,
    engines: eng.byTool,
    billAccountsLoaded: billAccounts,
  });
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, "load_summary.json"), JSON.stringify(summary, null, 1));
  log(`\n[done] wrote batth-ingestion/reports/load_summary.json`);

  // sanity: aggregates row count present (for the V-track cross-check)
  try {
    const agg = JSON.parse(readFileSync(AGG_PATH, "utf8")) as unknown[];
    log(`[note] interval_aggregates rows: ${agg.length}`);
  } catch {
    /* optional */
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
