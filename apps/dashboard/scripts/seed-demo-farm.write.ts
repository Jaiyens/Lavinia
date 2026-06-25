// DB-write half of the demo-farm seed. Imported lazily by seed-demo-farm.ts only under
// --write, so a dry run never loads Prisma. Persists the in-memory model to Supabase via
// DATABASE_URL_UNPOOLED (session pooler 5432), then runs the REAL recommendation engines
// (runRateLever + runSolarInsight) against the seeded farm, then persists hourly intervals.
//
// SAFETY: refuses any target that is not Supabase, and the pooled 6543 endpoint. Never
// touches local terra_batth or Neon. Idempotent: it deletes a prior farm of the same name
// (cascade) before creating, so re-runs are clean.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { runRateLever } from "@/lib/recommendations/run-rate-lever";
import { runSolarInsight } from "@/lib/recommendations/run-solar-insight";
import {
  build,
  isSolarNem,
  CARD,
  MONTHS,
  FARM_NAME,
  ENTITY_NAMES,
  CROPS,
  PERSON_NAMES,
  normSeasonal,
  shapeForLabel,
  peakFraction,
  type Meter,
} from "./seed-demo-farm";
import { mapScheduleLabel } from "@/lib/energy/rate-lever";

type Model = ReturnType<typeof build>;
type Summary = { annualSpend: number; savingsCents: number; estimateCount: number; qualitativeCount: number };

const AS_OF = "2026-06-09T12:00:00.000Z";
const DB_SIZE_CAP_BYTES = 430 * 1024 * 1024; // keep well under a 500MB free-tier ceiling
const INTERVAL_CHUNK = 5000;

function supabaseUnpooled(): string {
  const txt = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = txt.match(/^DATABASE_URL_UNPOOLED="?([^"\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL_UNPOOLED not found in apps/dashboard/.env");
  const url = m[1]!;
  if (!/supabase\.com/.test(url)) throw new Error(`REFUSING: target is not Supabase: ${url.replace(/:[^:@/]+@/, ":***@")}`);
  if (/:6543/.test(url)) throw new Error("REFUSING: pooled 6543 endpoint; use the 5432 session pooler");
  if (/127\.0\.0\.1|localhost|neon\.tech/.test(url)) throw new Error("REFUSING: local/Neon target");
  return url;
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export async function writeToSupabase(model: Model, summary: Summary): Promise<void> {
  const url = supabaseUnpooled();
  console.log(`\n[write] target: ${url.replace(/:[^:@/]+@/, ":***@")}`);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    // --- guard: wipe any prior demo farm of this name (cascade) so re-runs are clean ---
    const prior = await prisma.farm.findMany({ where: { name: FARM_NAME }, select: { id: true } });
    if (prior.length > 0) {
      console.log(`[write] deleting ${prior.length} prior "${FARM_NAME}" farm(s) (cascade)...`);
      await prisma.farm.deleteMany({ where: { name: FARM_NAME } });
    }

    // --- Farm ---
    const farm = await prisma.farm.create({
      data: { name: FARM_NAME, isDemo: true, timezone: "America/Los_Angeles", solarLayoutVerifiedAt: new Date("2026-05-01T00:00:00Z") },
    });
    console.log(`[write] farm ${farm.id} (${FARM_NAME}, isDemo)`);

    // --- Crops (name is globally unique; connect-or-create by name) ---
    const cropId = new Map<string, string>();
    for (const c of CROPS) {
      const row = await prisma.crop.upsert({
        where: { name: c.name },
        update: {},
        create: { name: c.name, cropCoefficient: c.kc },
      });
      cropId.set(c.name, row.id);
    }

    // --- Entities ---
    const entityIds: string[] = [];
    for (const e of ENTITY_NAMES) {
      const row = await prisma.entity.create({ data: { farmId: farm.id, name: e.name, billingName: e.billingName, actualOwner: e.owner } });
      entityIds.push(row.id);
    }

    // --- Accounts ---
    const accountIds: string[] = [];
    for (const a of model.accounts) {
      const row = await prisma.account.create({
        data: { farmId: farm.id, number: a.number, entityId: a.entityIdx !== null ? entityIds[a.entityIdx]! : null, coverageState: a.coverage },
      });
      accountIds.push(row.id);
    }

    // --- Ranches (+ one Block each) ---
    const ranchIds: string[] = [];
    const blockIds: string[] = [];
    for (let r = 0; r < model.ranchNames.length; r++) {
      const name = model.ranchNames[r]!;
      const crop = cropId.get(model.ranchCrops[r]!) ?? null;
      const acreage = Math.round((40 + Math.abs(Math.sin(r * 12.9898) * 1000) % 360) * 10) / 10;
      const ranch = await prisma.ranch.create({ data: { farmId: farm.id, name, cropId: crop, acreage } });
      ranchIds.push(ranch.id);
      const block = await prisma.block.create({ data: { farmId: farm.id, name: `${name} Field`, cropId: crop, acreage } });
      blockIds.push(block.id);
    }

    // --- Solar arrays ---
    const arrayIds: string[] = [];
    for (const arr of model.arrays) {
      const row = await prisma.solarArray.create({
        data: { farmId: farm.id, name: arr.name, nameplateKw: arr.nameplateKw, nemType: arr.nemType, trueUpMonth: arr.trueUpMonth, saId: arr.saId },
      });
      arrayIds.push(row.id);
    }

    // --- Pumps (+ nested billing periods + line items; connect ranch/account/crop/block/arrays) ---
    const pumpIdByIdx = new Map<number, string>();
    let periodCount = 0;
    let lineItemCount = 0;
    for (const m of model.meters) {
      const coverageState =
        m.costSource === "BILLED" ? "reconciled" : m.costSource === "REVIEW" ? "needs_review" : "no_bill";
      const fam = mapScheduleLabel(m.rateLabel, CARD, 100)?.plan.family ?? null;
      const isAg = fam !== null;
      const periodsData: Prisma.BillingPeriodCreateWithoutPumpInput[] = m.periods.map((p) => {
        periodCount += 1;
        lineItemCount += p.lineItems.length;
        const peakAt = new Date(new Date(p.start).getTime() + 14 * 86400000 + 15 * 3600000); // ~15th, 3pm
        return {
          start: new Date(p.start),
          close: new Date(p.close),
          cycleClose: new Date(p.close),
          printedTotalCents: p.printedTotalCents,
          tariff: p.tariff,
          demandChargeUsd: p.demandCents > 0 ? Math.round(p.demandCents) / 100 : null,
          peakKw: p.peakKw,
          peakAt: p.printedTotalCents !== null ? peakAt : null,
          totalBillUsd: p.printedTotalCents !== null ? p.printedTotalCents / 100 : null,
          totalKwh: p.totalKwh > 0 ? p.totalKwh : null,
          source: "green_button",
          billingLineItems: { create: p.lineItems.map((li) => ({ kind: li.kind, label: li.label, amountCents: li.amountCents, quantity: li.quantity, unit: li.unit, rate: li.rate })) },
        };
      });

      const pump = await prisma.pump.create({
        data: {
          farmId: farm.id,
          name: m.name,
          serviceId: m.serviceId,
          rateSchedule: m.rateLabel,
          growerPumpId: m.growerPumpId,
          kind: isAg ? "pump" : "non_pump",
          fuel: "electric",
          powerSource: "electric",
          status: m.status,
          gpm: m.gpm,
          horsepower: m.gpm !== null ? Math.round(m.peakKw * 1.1) : null,
          latitude: m.lat,
          longitude: m.lng,
          isSolar: m.isSolar,
          nemType: m.nemType,
          solarKw: m.solarKw,
          trueUpMonth: m.trueUpMonth,
          isLegacy: m.isLegacy,
          coverageState,
          modeledMonthlyCents: m.modeledMonthlyCents,
          accountId: m.accountIdx !== null ? accountIds[m.accountIdx]! : null,
          ranchId: m.ranchIdx !== null ? ranchIds[m.ranchIdx]! : null,
          cropId: cropId.get(m.cropName) ?? null,
          blocks: m.ranchIdx !== null ? { connect: [{ id: blockIds[m.ranchIdx]! }] } : undefined,
          benefitingArrays: m.arrayIdx !== null ? { connect: [{ id: arrayIds[m.arrayIdx]! }] } : undefined,
          billingPeriods: periodsData.length > 0 ? { create: periodsData } : undefined,
        },
      });
      pumpIdByIdx.set(m.idx, pump.id);
    }
    console.log(`[write] ${model.meters.length} pumps, ${periodCount} billing periods, ${lineItemCount} line items`);

    // --- NEM printed months for solar meters (drives the solar demand insight + true-up tab) ---
    let nemCount = 0;
    for (const m of model.meters) {
      if (!m.isSolar) continue;
      const pumpId = pumpIdByIdx.get(m.idx)!;
      const rows = MONTHS.map((mo) => {
        const ns = normSeasonal(mo.month);
        // net kWh: strong export (negative) in summer, mild import (positive) in deep winter
        const netKwh = Math.round((0.5 - ns) * m.peakKw * 30);
        const amountCents = Math.round(netKwh * 8); // small running balance, settles at true-up
        return { pumpId, start: new Date(mo.start), close: new Date(mo.close), netKwh, amountCents, source: "scanned_bill" };
      });
      await prisma.nemPeriod.createMany({ data: rows, skipDuplicates: true });
      nemCount += rows.length;
    }
    console.log(`[write] ${nemCount} NEM periods across ${model.meters.filter((m) => m.isSolar).length} solar meters`);

    // --- People + a live connection ---
    await prisma.person.createMany({
      data: PERSON_NAMES.map((name, i) => ({
        farmId: farm.id,
        name,
        email: i === 0 ? "owner@sundancevalley.example" : null,
        role: i === 0 ? "owner" : i < 3 ? "manager" : "irrigator",
        language: i === 4 ? "es" : "en",
      })),
    });
    await prisma.connection.create({
      data: { farmId: farm.id, type: "pge_smd", status: "active", source: "smd", externalRef: "demo-smd-auth", authorizedAt: new Date("2026-05-15T00:00:00Z") },
    });

    // --- RUN THE REAL ENGINES against the seeded farm ---
    console.log(`[write] running rate lever + solar insight...`);
    const rate = await runRateLever(prisma, farm.id, AS_OF);
    const solar = await runSolarInsight(prisma, farm.id, AS_OF);
    console.log(`[write] rateLever: ${rate.created} findings (${rate.estimates} $ estimates, ${rate.qualitative} qualitative, ${rate.legacyFlagged} legacy-flagged)`);
    console.log(`[write] solarInsight: ${solar.created} findings`);

    const recAgg = await prisma.recommendation.aggregate({ where: { farmId: farm.id, status: "pending", impactUsd: { not: null } }, _sum: { impactUsd: true } });
    console.log(`[write] persisted savings (sum impactUsd of pending recs): $${Math.round(recAgg._sum.impactUsd ?? 0).toLocaleString("en-US")}`);

    // --- Hourly intervals for BILLED + MODELED meters (last; size-guarded) ---
    if (process.env.SKIP_INTERVALS === "1") {
      console.log("[write] SKIP_INTERVALS=1 -> skipping interval persistence this run");
    } else {
      await persistIntervals(prisma, model, pumpIdByIdx);
    }

    // --- final counts ---
    const counts = await tableCounts(prisma, farm.id);
    console.log(`\n[write] DONE. Farm ${farm.id}`);
    console.log(`[write] counts: ${JSON.stringify(counts)}`);
    console.log(`[write] dry-run spend ${usd(summary.annualSpend)} | savings ${usd(summary.savingsCents)}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function dbSize(prisma: PrismaClient): Promise<number> {
  const r = await prisma.$queryRawUnsafe<{ s: bigint }[]>("select pg_database_size(current_database())::bigint as s");
  return Number(r[0]!.s);
}

async function persistIntervals(prisma: PrismaClient, model: Model, pumpIdByIdx: Map<number, string>): Promise<void> {
  const targets = model.meters.filter((m) => m.costSource === "BILLED" || m.costSource === "MODELED");
  console.log(`[write] persisting hourly intervals for ${targets.length} BILLED+MODELED meters (full 12 months)...`);
  let totalRows = 0;
  let metersDone = 0;
  let capped = false;
  for (const m of targets) {
    const size = await dbSize(prisma);
    if (size > DB_SIZE_CAP_BYTES) {
      capped = true;
      console.log(`[write] DB size ${(size / 1048576).toFixed(0)}MB exceeds cap; stopping intervals after ${metersDone} meters to protect the demo DB.`);
      break;
    }
    const rows = buildHourly(m, pumpIdByIdx.get(m.idx)!);
    for (let i = 0; i < rows.length; i += INTERVAL_CHUNK) {
      await prisma.usageInterval.createMany({ data: rows.slice(i, i + INTERVAL_CHUNK), skipDuplicates: true });
    }
    totalRows += rows.length;
    metersDone += 1;
    if (metersDone % 20 === 0) console.log(`[write]   ...${metersDone}/${targets.length} meters, ${totalRows.toLocaleString()} intervals`);
  }
  const finalSize = await dbSize(prisma);
  console.log(`[write] intervals: ${totalRows.toLocaleString()} rows across ${metersDone}/${targets.length} meters${capped ? " (CAPPED)" : ""}. DB size ${(finalSize / 1048576).toFixed(0)}MB`);
}

/** Hourly import intervals for a full year, shaped by the rate's 24h curve + seasonal envelope. */
function buildHourly(m: Meter, pumpId: string): Prisma.UsageIntervalCreateManyInput[] {
  const shape = shapeForLabel(m.rateLabel);
  const shapeMean = shape.reduce((s, v) => s + v, 0) / 24;
  const avgKw = m.peakKw * m.lf;
  const out: Prisma.UsageIntervalCreateManyInput[] = [];
  // simple per-meter deterministic noise
  let seed = (m.idx * 2654435761) >>> 0;
  const noise = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed % 1000) / 1000; };
  for (const mo of MONTHS) {
    const ns = normSeasonal(mo.month);
    const perDayKwh = avgKw * 24 * ns;
    for (let day = 1; day <= mo.days; day++) {
      for (let h = 0; h < 24; h++) {
        const base = (perDayKwh / 24) * ((shape[h] ?? 0) / shapeMean);
        const kWh = Math.max(0, base * (0.9 + 0.2 * noise()));
        const start = new Date(Date.UTC(mo.year, mo.month - 1, day, h, 0, 0));
        const touCode = h >= 17 && h < 20 ? "WPK" : "WOP";
        out.push({ pumpId, start, durationSec: 3600, kWh: Math.round(kWh * 1000) / 1000, direction: "import", touCode });
      }
    }
  }
  return out;
}

async function tableCounts(prisma: PrismaClient, farmId: string): Promise<Record<string, number>> {
  const [entities, accounts, ranches, blocks, pumps, periods, lineItems, arrays, nem, recs, persons, conns] = await Promise.all([
    prisma.entity.count({ where: { farmId } }),
    prisma.account.count({ where: { farmId } }),
    prisma.ranch.count({ where: { farmId } }),
    prisma.block.count({ where: { farmId } }),
    prisma.pump.count({ where: { farmId } }),
    prisma.billingPeriod.count({ where: { pump: { farmId } } }),
    prisma.billingLineItem.count({ where: { billingPeriod: { pump: { farmId } } } }),
    prisma.solarArray.count({ where: { farmId } }),
    prisma.nemPeriod.count({ where: { pump: { farmId } } }),
    prisma.recommendation.count({ where: { farmId } }),
    prisma.person.count({ where: { farmId } }),
    prisma.connection.count({ where: { farmId } }),
  ]);
  return { entities, accounts, ranches, blocks, pumps, periods, lineItems, arrays, nem, recs, persons, conns };
}
