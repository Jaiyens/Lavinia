// Batth-shaped seed. Expands fixtures/batth-farm.json into a realistic-scale farm:
// ~183 meters across ~57 PG&E accounts and 6 legal entities, two solar arrays on
// NEM2, and a mix of legacy (AG-4/AG-5) + current (AG-A/AG-B/AG-C) rates. Kept
// separate from seed.ts (the runnable entry) so tests can import it without a
// top-level run, mirroring sample-farm.ts.
//
// REPRESENTATIVE, not Batth's literal export. Deterministic (fixed PRNG seed),
// zero external calls. The finding-driving meters carry real interval history, and
// every bill is DERIVED by pricing that meter's generated usage on the published
// rate card under its CURRENT rate, so the rate engine reproduces the bill exactly
// (the honesty check reads "matched within 0%") and any savings it reports come
// purely from pricing the same usage on a different rate.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { loadRateCard } from "@/lib/pge/rate-card";
import { bucketUsage } from "@/lib/energy/rate-compare";
import {
  cycleCostUnderPlan,
  planFor,
  seasonFor,
  sizeClassFor,
  type CycleUsage,
  type RateCard,
  type RatePlan,
} from "@/lib/energy/rates";
import type { CycleBill, IntervalReading } from "@/lib/energy/types";

type SpecialMeter = {
  role: "hero" | "legacy-misrate" | "misrate" | "solar" | "demand-spike" | "bill-audit";
  name: string;
  ranch: string;
  rateSchedule: string;
  horsepower: number;
  gpm: number;
  profile: "low_lf" | "solar" | "steady";
  solarKw?: number;
  nemType?: string;
  trueUpMonth?: number;
  /**
   * Demand-charge-exposure scenario: on one day (month1/day, matched within the demo
   * window) the evening peak jumps to `factor`x nameplate, a single mistimed start that
   * drives that cycle's demand charge. The spike is real generated usage that really
   * raises the billed peak, so the bill stays derived (reproduction 0).
   */
  spike?: { month1: number; day: number; factor: number };
  /**
   * Bill-audit scenario: after the bills are derived from usage, one cycle's total is
   * inflated by `factor` while its peak/usage stay untouched, the "bill up, usage flat"
   * anomaly the audit engine flags. Only this one row of this one meter is overridden.
   */
  inflate?: { month1: number; factor: number };
};

type BatthFixture = {
  farm: { name: string; timezone: string };
  owner: { name: string; role: string; language: string };
  connection: { type: string; status: string; externalRef: string; authorizedAt: string };
  entities: string[];
  crops: { slug: string; name: string; cropCoefficient: number }[];
  ranches: { slug: string; name: string; acreage: number; crop: string; entity: number }[];
  meterCount: number;
  accountCount: number;
  rateMix: Record<string, number>;
  demoMonths: number;
  special: SpecialMeter[];
};

export function loadBatthFixture(): BatthFixture {
  const path = fileURLToPath(new URL("../fixtures/batth-farm.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as BatthFixture;
}

// Deterministic PRNG (mulberry32) so the same farm is generated every run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x6261_7474; // "batt"
const SERIALS = ["MR-07", "MR-14", "MR-21"];
const CENTER = { lat: 36.95, lng: -120.05 }; // Madera/Fresno county

// Peak kW a motor of this many HP pulls (≈ 0.62 kW/HP after losses).
function peakKwFor(horsepower: number): number {
  return Math.round(horsepower * 0.62);
}

// A day's load as [localHour, fractionOfPeak] points. Few hours, evening-set peak
// for the low-load-factor pumps; daytime + an evening peak for the solar meters; a
// broad, low, steady draw (high load factor, low daily peak) for the demand-spike meter,
// so its normal demand is modest and the injected spike day stands far above the rest.
function dayShape(
  profile: "low_lf" | "solar" | "steady",
  season: "summer" | "winter",
): [number, number][] {
  if (profile === "solar") {
    return season === "summer"
      ? [[10, 0.5], [13, 0.6], [19, 1.0], [2, 0.4]]
      : [[12, 0.4], [18, 0.5]];
  }
  if (profile === "steady") {
    // A near-continuous booster: high load factor (lots of energy, a modest, flat daily
    // peak). At this shape a max-demand rate (AG-B) is already the meter's best fit, so
    // the rate engine stays silent and the only finding is the injected demand spike.
    const f = season === "summer" ? 0.6 : 0.42;
    return Array.from({ length: 24 }, (_, h) => [h, f] as [number, number]);
  }
  return season === "summer"
    ? [[5, 0.55], [18, 1.0], [19, 0.7]]
    : [[5, 0.4], [18, 0.6]];
}

// Build the UTC instant for a local wall-clock hour. Uses a fixed seasonal offset
// (PDT -7 / PST -8); the DST transition days drift by an hour, immaterial for a seed.
function localHourToUtc(year: number, month1: number, day: number, hourLocal: number): string {
  const offset = month1 >= 5 && month1 <= 10 ? 7 : 8;
  return new Date(Date.UTC(year, month1 - 1, day, hourLocal + offset)).toISOString();
}

type GenCycle = {
  start: Date;
  close: Date;
  tariff: string;
  peakKw: number;
  peakAt: Date | null;
  demandChargeUsd: number | null;
  totalBillUsd: number;
  totalKwh: number;
  // Per-bucket TOU energy (kWh) for the cycle. Both generators already compute this from the
  // priced usage; carrying it lets persistence emit the canonical TOU BillingLineItems the
  // rebuilt Chart lens reads. A flat / non-TOU meter (B-1) carries all zeros.
  energyKwh: { peak: number; partial_peak: number; off_peak: number };
};
type GenInterval = { start: Date; durationSec: number; kWh: number };

// One canonical BillingLineItem to persist (integer cents; mirrors the extractor's shape).
type SeedLineItem = {
  billingPeriodId: string;
  kind: string;
  label: string;
  amountCents: number;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
};

// The 12 demo cycles ending the month before `asOf` (so it reads as "last year").
function demoCycles(asOf: Date, months: number): { year: number; month1: number }[] {
  const out: { year: number; month1: number }[] = [];
  // Most recent full month is asOf's month minus 1.
  let y = asOf.getUTCFullYear();
  let m = asOf.getUTCMonth(); // 0-based; this is (asOf month - 1) as 1-based
  for (let i = 0; i < months; i++) {
    out.unshift({ year: m === 0 ? y - 1 : y, month1: m === 0 ? 12 : m });
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

const SECONDS_PER_HOUR = 3600;
const DAYS_PER_CYCLE = 28; // fixed-length window keeps month math simple

// The demand portion of a cycle's bill under a plan (for BillingPeriod.demandChargeUsd).
function demandPortion(usage: CycleUsage, plan: RatePlan): number {
  const sp = usage.season === "summer" ? plan.summer : plan.winter;
  const max = (sp.demand.maxDemandPerKw ?? 0) * usage.maxDemandKw;
  const peak =
    usage.season === "summer"
      ? (sp.demand.peakPeriodDemandPerKw ?? 0) * usage.peakWindowDemandKw
      : 0;
  return Math.round((max + peak) * 100) / 100;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Generate one interval-backed meter's intervals + bills, deriving each bill by
// pricing the generated usage on its CURRENT plan (so the engine reproduces it).
function generateMetered(
  profile: "low_lf" | "solar" | "steady",
  peakKw: number,
  rateSchedule: string,
  cycles: { year: number; month1: number }[],
  card: RateCard,
  tz: string,
  spike?: { month1: number; day: number; factor: number },
): { bills: GenCycle[]; intervals: GenInterval[] } {
  const bills: GenCycle[] = [];
  const intervals: GenInterval[] = [];
  const sizeClass = sizeClassFor(peakKw, card);
  const plan = planFor(card, rateSchedule, sizeClass);

  for (const { year, month1 } of cycles) {
    const season = seasonFor(month1, card);
    const shape = dayShape(profile, season);
    const mm = String(month1).padStart(2, "0");
    const cycleIntervals: IntervalReading[] = [];
    let maxKw = 0;
    let peakAt: Date | null = null;

    for (let day = 1; day <= DAYS_PER_CYCLE; day++) {
      // One mistimed start: on the spike day the 5pm interval jumps to factor x nameplate,
      // far above this meter's flat baseline. Merge by hour (Map) so it replaces, never
      // duplicates, the day's 5pm point, keeping interval starts unique. Real usage, really billed.
      const isSpikeDay = spike && spike.month1 === month1 && spike.day === day;
      const dayShapePoints: [number, number][] = isSpikeDay
        ? [...new Map<number, number>([...shape, [17, spike!.factor]]).entries()]
        : shape;
      for (const [hourLocal, frac] of dayShapePoints) {
        const kw = round2(peakKw * frac);
        const iso = localHourToUtc(year, month1, day, hourLocal);
        cycleIntervals.push({ start: iso, durationSec: SECONDS_PER_HOUR, kWh: kw }); // 1h -> kWh == kW
        intervals.push({ start: new Date(iso), durationSec: SECONDS_PER_HOUR, kWh: kw });
        if (kw > maxKw) {
          maxKw = kw;
          peakAt = new Date(iso);
        }
      }
    }

    // Bucket with the SAME engine logic that will re-read these intervals, so the
    // derived bill is exactly what the engine reconstructs (reproduction error 0).
    const tempBill: CycleBill = {
      start: `${year}-${mm}-01`,
      close: `${year}-${mm}-${DAYS_PER_CYCLE}`,
      demandChargeUsd: null,
      peakKw: null,
    };
    const usage = bucketUsage(cycleIntervals, [tempBill], tz, card).cycles[0];
    if (!usage) continue;
    const total = plan ? round2(cycleCostUnderPlan(usage, plan)) : 0;
    const demand = plan ? demandPortion(usage, plan) : null;
    const totalKwh = round2(
      usage.energyKwh.peak + usage.energyKwh.partial_peak + usage.energyKwh.off_peak,
    );

    bills.push({
      start: new Date(Date.UTC(year, month1 - 1, 1)),
      close: new Date(Date.UTC(year, month1 - 1, DAYS_PER_CYCLE)),
      tariff: rateSchedule,
      peakKw: usage.maxDemandKw,
      peakAt,
      demandChargeUsd: demand,
      totalBillUsd: total,
      totalKwh,
      energyKwh: {
        peak: usage.energyKwh.peak,
        partial_peak: usage.energyKwh.partial_peak,
        off_peak: usage.energyKwh.off_peak,
      },
    });
  }
  return { bills, intervals };
}

// Generate a summary-only meter's 12 bills (no intervals): a deterministic usage
// shape by rate family + size, priced on the current plan. These populate the
// calendar and bill totals; with no interval history the rate engine makes no
// dollar claim about them (only the legacy-rate flag, with no number).
function generateSummaryBills(
  rateSchedule: string,
  sizeFactor: number,
  cycles: { year: number; month1: number }[],
  card: RateCard,
): GenCycle[] {
  // Non-ag (B-1): a small, flat office/shop load, no demand charge.
  if (rateSchedule === "B-1") {
    return cycles.map(({ year, month1 }) => {
      const total = round2(900 * (0.16 + 0.04 * sizeFactor));
      return {
        start: new Date(Date.UTC(year, month1 - 1, 1)),
        close: new Date(Date.UTC(year, month1 - 1, DAYS_PER_CYCLE)),
        tariff: rateSchedule,
        peakKw: round2(6 + 4 * sizeFactor),
        peakAt: new Date(Date.UTC(year, month1 - 1, 15, 21)),
        demandChargeUsd: null,
        totalBillUsd: total,
        totalKwh: round2(900 * (0.5 + 0.3 * sizeFactor)),
        // B-1 is a flat non-TOU commercial load: no TOU split, so it bills as a single energy
        // line and is intentionally not drawn on the TOU chart (counted as "without TOU").
        energyKwh: { peak: 0, partial_peak: 0, off_peak: 0 },
      };
    });
  }

  const basePeak: Record<string, number> = {
    "AG-C": 95,
    "AG-5": 95,
    "AG-B": 62,
    "AG-4": 62,
    "AG-A": 45,
  };
  const peak = (basePeak[rateSchedule] ?? 60) * (0.45 + 0.9 * sizeFactor);
  const sizeClass = sizeClassFor(peak, card);
  const plan = planFor(card, rateSchedule, sizeClass);

  return cycles.map(({ year, month1 }) => {
    const season = seasonFor(month1, card);
    const scale = season === "summer" ? 1 : 0.4;
    const maxDemandKw = round2(peak * scale);
    const usage: CycleUsage = {
      start: `${year}-${String(month1).padStart(2, "0")}-01`,
      close: `${year}-${String(month1).padStart(2, "0")}-28`,
      season,
      // A moderate-load-factor profile, mostly off-peak with some evening use.
      energyKwh: {
        peak: round2(peak * 30 * scale),
        partial_peak: 0,
        off_peak: round2(peak * 120 * scale),
      },
      maxDemandKw,
      peakWindowDemandKw: round2(peak * 0.7 * scale),
    };
    const total = plan ? round2(cycleCostUnderPlan(usage, plan)) : 0;
    const demand = plan ? demandPortion(usage, plan) : null;
    const totalKwh = round2(
      usage.energyKwh.peak + usage.energyKwh.partial_peak + usage.energyKwh.off_peak,
    );
    return {
      start: new Date(Date.UTC(year, month1 - 1, 1)),
      close: new Date(Date.UTC(year, month1 - 1, DAYS_PER_CYCLE)),
      tariff: rateSchedule,
      peakKw: maxDemandKw,
      peakAt: new Date(Date.UTC(year, month1 - 1, 15, 14)), // midday; no solar logic here
      demandChargeUsd: demand,
      totalBillUsd: total,
      totalKwh,
      energyKwh: {
        peak: usage.energyKwh.peak,
        partial_peak: usage.energyKwh.partial_peak,
        off_peak: usage.energyKwh.off_peak,
      },
    };
  });
}

export type SeededBatth = Awaited<ReturnType<typeof seedBatthFarm>>;

/**
 * Seed the representative Batth farm into `prisma`. Idempotent: clears prior DEMO farms
 * (cascades to all demo-farm-scoped data) and upserts the shared crops, so it can run
 * repeatedly. Returns the farm id and a few counts. The recommendation engine is
 * run separately (see src/lib/recommendations/run.ts) by the runnable seed.
 *
 * ONLY the synthetic demo (`isDemo: true`) is cleared. A real connected account
 * (`isDemo: false`, e.g. the bill-import fixture or an onboarded grower) is PRESERVED, so
 * `db:seed` / `db:reset` / the auto-seed on `db:migrate` can never delete real grower data.
 */
export async function seedBatthFarm(prisma: PrismaClient) {
  const fx = loadBatthFixture();
  const card = loadRateCard();
  const rng = mulberry32(SEED);
  const asOf = new Date("2026-06-04T12:00:00.000Z");
  const cycles = demoCycles(asOf, fx.demoMonths);

  // Crops are shared across farms (unique by name); everything else is farm-scoped.
  // Scope the wipe to demo farms so real (isDemo:false) accounts survive a re-seed.
  await prisma.farm.deleteMany({ where: { isDemo: true } });
  const cropIdBySlug = new Map<string, string>();
  for (const crop of fx.crops) {
    const row = await prisma.crop.upsert({
      where: { name: crop.name },
      update: { cropCoefficient: crop.cropCoefficient },
      create: { name: crop.name, cropCoefficient: crop.cropCoefficient },
    });
    cropIdBySlug.set(crop.slug, row.id);
  }

  const farm = await prisma.farm.create({
    data: {
      name: fx.farm.name,
      timezone: fx.farm.timezone,
      isDemo: true, // seed/demo data, not a grower's live farm
      people: { create: [{ name: fx.owner.name, role: fx.owner.role, language: fx.owner.language }] },
      connections: {
        create: [
          {
            type: fx.connection.type,
            status: fx.connection.status,
            // Representative demo data, not a real authorization (C4 provenance).
            source: "sample",
            externalRef: fx.connection.externalRef,
            authorizedAt: new Date(fx.connection.authorizedAt),
          },
        ],
      },
    },
  });

  // Entities.
  const entityIds: string[] = [];
  for (const name of fx.entities) {
    const e = await prisma.entity.create({ data: { name, farmId: farm.id } });
    entityIds.push(e.id);
  }

  // Ranches (Blocks), each tied to an entity's crop.
  const blockIdBySlug = new Map<string, string>();
  const blockEntityBySlug = new Map<string, number>();
  for (const ranch of fx.ranches) {
    const cropId = cropIdBySlug.get(ranch.crop);
    const b = await prisma.block.create({
      data: { name: ranch.name, acreage: ranch.acreage, farmId: farm.id, cropId: cropId ?? null },
    });
    blockIdBySlug.set(ranch.slug, b.id);
    blockEntityBySlug.set(ranch.slug, ranch.entity);
  }
  const ranchesByEntity = new Map<number, string[]>();
  for (const ranch of fx.ranches) {
    const list = ranchesByEntity.get(ranch.entity) ?? [];
    list.push(ranch.slug);
    ranchesByEntity.set(ranch.entity, list);
  }

  // Accounts spread round-robin across entities.
  const accountIds: string[] = [];
  const accountEntity: number[] = [];
  for (let i = 0; i < fx.accountCount; i++) {
    const entityIdx = i % fx.entities.length;
    const number = `${5500000000 + i * 137}`;
    const a = await prisma.account.create({
      data: { number, farmId: farm.id, entityId: entityIds[entityIdx] },
    });
    accountIds.push(a.id);
    accountEntity.push(entityIdx);
  }

  // A rate pool sized to the meter count, shuffled deterministically.
  const ratePool: string[] = [];
  for (const [rate, count] of Object.entries(fx.rateMix)) {
    for (let i = 0; i < count; i++) ratePool.push(rate);
  }
  while (ratePool.length < fx.meterCount) ratePool.push("AG-C");
  for (let i = ratePool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = ratePool[i];
    const b = ratePool[j];
    if (a === undefined || b === undefined) continue;
    ratePool[i] = b;
    ratePool[j] = a;
  }

  const specialByIndex = new Map<number, SpecialMeter>();
  fx.special.forEach((s, i) => specialByIndex.set(i, s));

  const allBills: { pumpId: string; b: GenCycle }[] = [];
  const allIntervals: { pumpId: string; iv: GenInterval }[] = [];

  for (let i = 0; i < fx.meterCount; i++) {
    const special = specialByIndex.get(i);
    const accountIdx = i % fx.accountCount;
    const entityIdx = accountEntity[accountIdx] ?? 0;

    let rateSchedule: string;
    let name: string;
    let horsepower: number;
    let gpm: number | null;
    let blockSlug: string;
    let solarKw: number | null = null;
    let nemType: string | null = null;
    let trueUpMonth: number | null = null;
    let metered: { bills: GenCycle[]; intervals: GenInterval[] } | null = null;

    if (special) {
      rateSchedule = special.rateSchedule;
      name = special.name;
      horsepower = special.horsepower;
      gpm = special.gpm;
      blockSlug = special.ranch;
      solarKw = special.solarKw ?? null;
      nemType = special.nemType ?? null;
      trueUpMonth = special.trueUpMonth ?? null;
      metered = generateMetered(
        special.profile,
        peakKwFor(special.horsepower),
        rateSchedule,
        cycles,
        card,
        fx.farm.timezone,
        special.spike,
      );
      // Bill-audit scenario: inflate one cycle's total after derivation, leaving its
      // peak and intervals untouched, so only that cycle reads as "bill up, usage flat."
      if (special.inflate) {
        const target = metered.bills.find(
          (b) => b.start.getUTCMonth() + 1 === special.inflate!.month1,
        );
        if (target) target.totalBillUsd = round2(target.totalBillUsd * special.inflate.factor);
      }
    } else {
      rateSchedule = ratePool[i] ?? "AG-C";
      const ranchOptions = ranchesByEntity.get(entityIdx) ?? fx.ranches.map((r) => r.slug);
      blockSlug = ranchOptions[Math.floor(rng() * ranchOptions.length)] ?? "ranch";
      const isNonAg = rateSchedule === "B-1";
      horsepower = isNonAg ? 0 : Math.round(40 + rng() * 160);
      gpm = isNonAg ? null : Math.round(600 + rng() * 2400);
      const ranchName = fx.ranches.find((r) => r.slug === blockSlug)?.name ?? "Well";
      name = isNonAg ? `${ranchName} Shop` : `${ranchName} Well ${1 + (i % 4)}`;
    }

    const lat = round5(CENTER.lat + (rng() - 0.5) * 0.5);
    const lng = round5(CENTER.lng + (rng() - 0.5) * 0.5);

    const pump = await prisma.pump.create({
      data: {
        name,
        serviceId: `84${String(1000000 + i).padStart(8, "0")}`,
        meterSerial: `10${String(2000000 + i * 7).padStart(8, "0")}`,
        rateSchedule,
        billingSerial: SERIALS[i % SERIALS.length],
        location: fx.ranches.find((r) => r.slug === blockSlug)?.name ?? null,
        horsepower: horsepower || null,
        gpm,
        kind: rateSchedule === "B-1" ? "non_pump" : "pump",
        latitude: lat,
        longitude: lng,
        solarKw,
        isSolar: solarKw != null, // keep the day-one flag consistent with the flat solar fields
        nemType,
        trueUpMonth,
        // Every seeded meter's 12 cycles are derived (reproduction error 0), so the demo reads
        // as a fully reconciled account. The dashboard reads coverageState DIRECTLY off the pump
        // (not from bill rows), so it must be set here for the canonical billing below to surface.
        coverageState: "reconciled",
        farmId: farm.id,
        accountId: accountIds[accountIdx],
        blocks: { connect: [{ id: blockIdBySlug.get(blockSlug)! }] },
      },
    });

    const bills = metered
      ? metered.bills
      : generateSummaryBills(rateSchedule, rng(), cycles, card);
    for (const b of bills) allBills.push({ pumpId: pump.id, b });
    if (metered) for (const iv of metered.intervals) allIntervals.push({ pumpId: pump.id, iv });
  }

  await prisma.billingPeriod.createMany({
    data: allBills.map(({ pumpId, b }) => ({
      pumpId,
      start: b.start,
      close: b.close,
      // The posted cycle close mirrors the source period end for the synthetic demo (the
      // Calendar lens reads it). printedTotalCents is the integer-cents canonical total the
      // table and KPI strip read; the per-bucket BillingLineItems below reconcile to it.
      cycleClose: b.close,
      printedTotalCents: Math.round(b.totalBillUsd * 100),
      tariff: b.tariff,
      demandChargeUsd: b.demandChargeUsd,
      peakKw: b.peakKw,
      peakAt: b.peakAt,
      totalBillUsd: b.totalBillUsd,
      totalKwh: b.totalKwh,
      source: "green_button",
    })),
  });

  // Attach the canonical TOU + demand BillingLineItems so the Chart lens (which reads only
  // tou_energy lines), the table, and the KPI strip light up. createMany cannot return ids, so
  // re-read the just-written periods by their (pumpId, start) unique key and bulk-insert the
  // lines keyed to them. Each cycle's lines sum EXACTLY to printedTotalCents, so the demo
  // reconciles like a real extracted account. Chunked to stay clear of Postgres parameter caps.
  const pumpIds = [...new Set(allBills.map(({ pumpId }) => pumpId))];
  const periodRows = await prisma.billingPeriod.findMany({
    where: { pumpId: { in: pumpIds } },
    select: { id: true, pumpId: true, start: true },
  });
  const periodIdByKey = new Map(
    periodRows.map((r) => [`${r.pumpId}|${r.start.toISOString()}`, r.id]),
  );
  const lineItems = allBills.flatMap(({ pumpId, b }) => {
    const id = periodIdByKey.get(`${pumpId}|${b.start.toISOString()}`);
    return id ? buildBillLineItems(id, b) : [];
  });
  for (let i = 0; i < lineItems.length; i += 2000) {
    await prisma.billingLineItem.createMany({ data: lineItems.slice(i, i + 2000) });
  }

  await prisma.usageInterval.createMany({
    data: allIntervals.map(({ pumpId, iv }) => ({
      pumpId,
      start: iv.start,
      durationSec: iv.durationSec,
      kWh: iv.kWh,
    })),
  });

  return {
    id: farm.id,
    name: farm.name,
    pumps: fx.meterCount,
    entities: fx.entities.length,
    accounts: fx.accountCount,
    bills: allBills.length,
    intervals: allIntervals.length,
  };
}

function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}

// Split one derived cycle into the canonical BillingLineItems the rebuilt dashboard reads:
// per-bucket TOU energy lines (so the Chart lens can stack peak / part-peak / off-peak), plus a
// demand line. The energy remainder (printedTotal - demand) is distributed across the present TOU
// buckets, weighted so peak dollars run proportionally larger than peak kWh (the real TOU story,
// a representative-demo modeling choice, not a precision claim), then largest-remainder rounded so
// the cents sum EXACTLY back to printedTotalCents. A flat meter (no TOU shape, e.g. the B-1 office
// load) gets a single non-TOU energy line and is simply not charted.
function buildBillLineItems(billingPeriodId: string, b: GenCycle): SeedLineItem[] {
  const printedTotalCents = Math.round(b.totalBillUsd * 100);
  const demandCents = b.demandChargeUsd != null ? Math.round(b.demandChargeUsd * 100) : 0;
  const energyCents = Math.max(0, printedTotalCents - demandCents);
  const items: SeedLineItem[] = [];

  // Labels match the chart's classifyTou() matcher ("Peak", "Part-Peak", "Off-Peak").
  const buckets = [
    { label: "Peak", kwh: b.energyKwh.peak, weight: 2.0 },
    { label: "Part-Peak", kwh: b.energyKwh.partial_peak, weight: 1.3 },
    { label: "Off-Peak", kwh: b.energyKwh.off_peak, weight: 1.0 },
  ].filter((x) => x.kwh > 0);
  const weighted = buckets.reduce((acc, x) => acc + x.kwh * x.weight, 0);

  if (energyCents > 0 && weighted > 0) {
    let assigned = 0;
    buckets.forEach((x, i) => {
      const isLast = i === buckets.length - 1;
      const cents = isLast
        ? energyCents - assigned
        : Math.round((energyCents * (x.kwh * x.weight)) / weighted);
      if (!isLast) assigned += cents;
      items.push({
        billingPeriodId,
        kind: "tou_energy",
        label: x.label,
        amountCents: cents,
        quantity: round5(x.kwh),
        unit: "kWh",
        rate: round5(cents / 100 / x.kwh),
      });
    });
  } else if (energyCents > 0) {
    // Flat / non-TOU energy (the B-1 office load): one line, reconciles, never charted.
    items.push({
      billingPeriodId,
      kind: "other",
      label: "Energy",
      amountCents: energyCents,
      quantity: b.totalKwh > 0 ? round5(b.totalKwh) : null,
      unit: "kWh",
      rate: null,
    });
  }

  if (demandCents > 0) {
    items.push({
      billingPeriodId,
      kind: "demand",
      label: "Demand",
      amountCents: demandCents,
      quantity: b.peakKw > 0 ? round5(b.peakKw) : null,
      unit: "kW",
      rate: null,
    });
  }

  return items;
}
