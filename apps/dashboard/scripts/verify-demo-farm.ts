// Verify the seeded demo farm on Supabase: row counts, dashboard spend (via the REAL
// kpi rollup), savings, sample bills, every view's population, geo clustering, and a
// Batth-identifier scrub. Read-only.  Run from apps/dashboard:  npx tsx scripts/verify-demo-farm.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { computeKpiStrip, spendByMonth } from "@/lib/dashboard/kpi";

const FARM_NAME = "Sundance Valley Farms";
const FRESNO = { lat: 36.7378, lng: -119.7871 };
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usdF = (d: number) => `$${Math.round(d).toLocaleString("en-US")}`;

function url(): string {
  const u = readFileSync(join(process.cwd(), ".env"), "utf8").match(/^DATABASE_URL_UNPOOLED="?([^"\n]+)"?/m)?.[1];
  if (!u || !/supabase\.com/.test(u)) throw new Error("bad target");
  return u;
}
function milesFromFresno(lat: number, lng: number): number {
  const dLat = (lat - FRESNO.lat) * 69;
  const dLng = (lng - FRESNO.lng) * 55.5;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: url() });
  const farm = await prisma.farm.findFirstOrThrow({ where: { name: FARM_NAME } });
  console.log(`\n================ VERIFY: ${FARM_NAME} (${farm.id}, isDemo=${farm.isDemo}) ================\n`);

  // ---- row counts ----
  const counts = {
    farms: await prisma.farm.count(),
    entities: await prisma.entity.count({ where: { farmId: farm.id } }),
    accounts: await prisma.account.count({ where: { farmId: farm.id } }),
    ranches: await prisma.ranch.count({ where: { farmId: farm.id } }),
    blocks: await prisma.block.count({ where: { farmId: farm.id } }),
    crops: await prisma.crop.count(),
    pumps: await prisma.pump.count({ where: { farmId: farm.id } }),
    billingPeriods: await prisma.billingPeriod.count({ where: { pump: { farmId: farm.id } } }),
    billingLineItems: await prisma.billingLineItem.count({ where: { billingPeriod: { pump: { farmId: farm.id } } } }),
    usageIntervals: await prisma.usageInterval.count({ where: { pump: { farmId: farm.id } } }),
    solarArrays: await prisma.solarArray.count({ where: { farmId: farm.id } }),
    nemPeriods: await prisma.nemPeriod.count({ where: { pump: { farmId: farm.id } } }),
    recommendations: await prisma.recommendation.count({ where: { farmId: farm.id } }),
    persons: await prisma.person.count({ where: { farmId: farm.id } }),
    connections: await prisma.connection.count({ where: { farmId: farm.id } }),
  };
  console.log("ROW COUNTS:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);

  // ---- the dashboard's OWN spend rollup (kpi) ----
  const meters = await loadMetersForFarm(prisma, farm.id);
  const solarNem = (m: (typeof meters)[number]) => m.isSolar || m.solarKw != null || m.nemType != null;
  const months = spendByMonth(meters);
  const annual = months.reduce((s, m) => s + m.cents, 0); // dashboard spendByMonth (this kpi version includes solar)
  const recon = meters.filter((m) => m.coverageState === "reconciled");
  const nonSolarTotal = recon.filter((m) => !solarNem(m)).reduce((s, m) => s + m.periods.reduce((a, p) => a + (p.printedTotalCents ?? 0), 0), 0);
  const solarTotal = recon.filter(solarNem).reduce((s, m) => s + m.periods.reduce((a, p) => a + (p.printedTotalCents ?? 0), 0), 0);
  const kpi = computeKpiStrip(meters);
  console.log(`\nSPEND (dashboard kpi rollups):`);
  console.log(`  ALL-reconciled annual (spendByMonth, this kpi includes solar): ${usd(annual)}   [target $5.6M-$6.0M; NOT $8.32M]`);
  console.log(`  non-solar reconciled annual: ${usd(nonSolarTotal)}   solar (NEM net, demand-dominated): ${usd(solarTotal)}`);
  console.log(`  KPI headline (latest month, all reconciled): ${usd(kpi.spend.cents)}   coverage ${kpi.spend.coverage.loaded}/${kpi.spend.coverage.total}`);
  console.log(`  monthly series: ${months.map((m) => `${m.month}:${usd(m.cents)}`).join("  ")}`);
  console.log(`  demand exposure: ${kpi.demand.hasDemand ? usd(kpi.demand.cents) : "none"}`);

  // ---- savings (real engine recs) ----
  const recByTool = await prisma.recommendation.groupBy({ by: ["tool"], where: { farmId: farm.id, status: "pending" }, _count: true });
  const recBySev = await prisma.recommendation.groupBy({ by: ["severity"], where: { farmId: farm.id, status: "pending" }, _count: true });
  const savings = await prisma.recommendation.aggregate({ where: { farmId: farm.id, status: "pending", impactUsd: { not: null } }, _sum: { impactUsd: true }, _count: true });
  const savingsUsd = savings._sum.impactUsd ?? 0;
  console.log(`\nSAVINGS (real rateLever + solarInsight):`);
  console.log(`  identified savings (sum impactUsd of pending recs): ${usdF(savingsUsd)}   (~${(100 * savingsUsd * 100 / annual).toFixed(1)}% of all-reconciled, ~${(100 * savingsUsd * 100 / nonSolarTotal).toFixed(1)}% of non-solar)   [target ~$580K / ~10%]`);
  console.log(`  recs by tool: ${recByTool.map((r) => `${r.tool}=${r._count}`).join("  ")}`);
  console.log(`  recs by severity: ${recBySev.map((r) => `${r.severity}=${r._count}`).join("  ")}`);
  console.log(`  $-bearing findings: ${savings._count}`);

  // ---- 3 sample bills with rate schedule ----
  console.log(`\n3 SAMPLE BILLS (rate schedule + a recent reconciled cycle):`);
  const sampleMeters = meters.filter((m) => m.coverageState === "reconciled" && m.periods.some((p) => p.printedTotalCents != null)).slice(0, 3);
  for (const m of sampleMeters) {
    const p = [...m.periods].reverse().find((x) => x.printedTotalCents != null)!;
    const items = p.lineItems.map((li) => `${li.label}=${usd(li.amountCents)}`).join(", ");
    const sum = p.lineItems.reduce((s, li) => s + li.amountCents, 0);
    console.log(`  ${m.name} [${m.rateSchedule}] acct ${m.accountNumber} | ${p.start.slice(0, 7)} total ${usd(p.printedTotalCents!)} peakKw ${p.peakKw}`);
    console.log(`     line items (${usd(sum)} == total? ${sum === p.printedTotalCents}): ${items}`);
  }

  // ---- views populate ----
  const located = meters.filter((m) => m.latitude != null && m.longitude != null && !(m.latitude === 0 && m.longitude === 0));
  const ranches = new Set(meters.map((m) => m.ranchName).filter(Boolean));
  const crops = new Set(meters.map((m) => m.cropName).filter(Boolean));
  const entities = new Set(meters.map((m) => m.entityName).filter(Boolean));
  const withPeak = meters.filter((m) => m.periods.some((p) => p.peakKw != null));
  const withDemand = meters.filter((m) => m.periods.some((p) => p.demandCents != null && p.demandCents > 0));
  const solar = meters.filter((m) => m.isSolar);
  const withNem = meters.filter((m) => m.nemType != null);
  const withArray = meters.filter((m) => m.benefitingArrays.length > 0);
  const withNemPeriods = meters.filter((m) => m.nemPeriods.length > 0);
  const modeled = meters.filter((m) => m.costSource === "MODELED");
  const review = meters.filter((m) => m.costSource === "REVIEW");
  const none = meters.filter((m) => m.costSource === "NONE");
  console.log(`\nVIEW POPULATION:`);
  console.log(`  energy map: ${located.length}/${meters.length} meters have valid lat/long pins`);
  console.log(`  rollups: ${entities.size} entities, ${ranches.size} ranches, ${crops.size} crops -> ${[...crops].join(", ")}`);
  console.log(`  demand table: ${withPeak.length} meters carry peakKw; ${withDemand.length} carry a demand charge`);
  console.log(`  cost sources: BILLED ${meters.filter((m) => m.costSource === "BILLED").length}, MODELED ${modeled.length}, REVIEW ${review.length}, NONE ${none.length}`);
  console.log(`  solar/NEM: ${solar.length} solar meters, ${withNem.length} with nemType, ${withArray.length} linked to arrays, ${withNemPeriods.length} with NEM months, ${counts.solarArrays} arrays`);

  // ---- geo clustering ----
  const lats = located.map((m) => m.latitude!);
  const lngs = located.map((m) => m.longitude!);
  const dists = located.map((m) => milesFromFresno(m.latitude!, m.longitude!));
  const within40 = dists.filter((d) => d <= 40).length;
  console.log(`\nGEO (around Fresno ${FRESNO.lat}, ${FRESNO.lng}):`);
  console.log(`  lat ${Math.min(...lats).toFixed(3)}..${Math.max(...lats).toFixed(3)}  lng ${Math.min(...lngs).toFixed(3)}..${Math.max(...lngs).toFixed(3)}`);
  console.log(`  distance from Fresno: ${Math.min(...dists).toFixed(1)}..${Math.max(...dists).toFixed(1)} mi; within 40mi: ${within40}/${located.length}`);

  // ---- Batth-identifier scrub ----
  console.log(`\nBATTH-IDENTIFIER SCRUB:`);
  const forbidden = ["batth", "caruthers", "madera"];
  const textBlobs: string[] = [];
  textBlobs.push(farm.name);
  (await prisma.entity.findMany({ where: { farmId: farm.id } })).forEach((e) => textBlobs.push(e.name ?? "", e.billingName ?? "", e.actualOwner ?? ""));
  (await prisma.ranch.findMany({ where: { farmId: farm.id } })).forEach((r) => textBlobs.push(r.name));
  (await prisma.account.findMany({ where: { farmId: farm.id } })).forEach((a) => textBlobs.push(a.number));
  meters.forEach((m) => textBlobs.push(m.name, m.serviceId ?? "", m.rateSchedule ?? "", m.growerPumpId ?? "", m.accountNumber ?? ""));
  (await prisma.solarArray.findMany({ where: { farmId: farm.id } })).forEach((s) => textBlobs.push(s.name ?? "", s.saId ?? ""));
  const hay = textBlobs.join(" \n ").toLowerCase();
  let hits = 0;
  for (const f of forbidden) {
    const n = (hay.match(new RegExp(f, "g")) ?? []).length;
    if (n > 0) { console.log(`  !! FORBIDDEN "${f}": ${n} hits`); hits += n; }
  }
  // P0xx grower pump ids (Batth's scheme) — ours are M-0xx
  const p0xx = (hay.match(/\bp0\d\d\b/g) ?? []).length;
  if (p0xx > 0) { console.log(`  !! P0xx grower-id pattern: ${p0xx} hits`); hits += p0xx; }
  // headline must not be $8.32M
  const isBatthTotal = Math.abs(annual / 100 - 8_320_000) < 50_000;
  console.log(`  forbidden string hits: ${hits} (expect 0)`);
  console.log(`  headline == Batth ~$8.32M? ${isBatthTotal} (expect false); headline = ${usd(annual)}`);
  console.log(`  Batth real-coord band (36.256-36.763 / Caruthers SW)? our lng min ${Math.min(...lngs).toFixed(3)} (Caruthers ~ -119.83..-120.0)`);

  console.log(`\n================ ${hits === 0 && !isBatthTotal ? "PASS" : "REVIEW NEEDED"} ================\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
