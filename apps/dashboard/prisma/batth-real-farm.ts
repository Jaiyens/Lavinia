// Batth REAL seed. Lands the real Batth export (fixtures/batth-real-meters.json) into a
// farm so the dashboard can render the grower's ACTUAL account, not the representative
// synthetic demo (prisma/batth-farm.ts). Kept separate from seed.ts (the runnable entry)
// so it can be imported without a top-level run, mirroring batth-farm.ts / sample-farm.ts.
//
// GROUND TRUTH (do not overstate downstream): the fixture's 46 billed meters carry real
// printed dollars (totalBillUsd + a demand line); the other ~140 are map/metadata-only
// (empty summaries) until their billing lands. intervals are EMPTY everywhere (no Green
// Button interval export yet), so the interval-driven levers (rate-compare bucketing,
// daily-outlier) honestly no-op and only the bill-level signals (demand exposure, bill
// anomaly) are provable today. Solar is two arrays totalling 1,932 kW (840 + 1,092).
//
// HOW IT LOADS: the fixture is NormalizedMeter[]-shaped, so the meters/accounts/bills land
// through the SAME importMeters path the live Green Button / UtilityAPI connect uses (no
// special-case ingestion). importMeters consumes only serviceId/tariff/summaries/intervals;
// the per-meter non-NormalizedMeter `meta` block (map pins, ranch, entity, crop, solar, NEM)
// is then applied onto the landed pumps below so the Map / Table / Solar lenses render too.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { centsFromDollars } from "@/lib/format/money";
import { importMeters } from "@/lib/greenbutton/import";
import type { NormalizedMeter, NormalizedSummary } from "@/lib/normalize";

// --- the fixture shape (NormalizedMeter + a non-NormalizedMeter `meta` block) ----------

/** The per-meter NEM block the master inventory carries for a billed meter. */
type FixtureNem = {
  nemEnrolled: boolean;
  trueUpAmountUsd: number | null;
  /** Numeric settle month (1-12) for a billed meter; null when unknown. */
  trueUpMonth: number | null;
  annualNetKwh: number | null;
};

/** The non-NormalizedMeter metadata block: map pins + inventory the engines never read. */
type FixtureMeta = {
  growerPumpId: string | null;
  rateSchedule: string | null;
  latitude: number | null;
  longitude: number | null;
  ranch: string | null;
  entity: string | null;
  /** True legal owner when the sheet separates it from the billing entity; else null. */
  actualOwner?: string | null;
  status: string | null;
  gpm: number | null;
  crop: string | null;
  /** Program code as printed (e.g. "NEM2AA"); stored verbatim on the pump. */
  nemType: string | null;
  /** Billed-meter peak kW; carried for reference, the engine derives peak from intervals. */
  peakKw: number | null;
  billed: boolean;
  /** The array group label ("840kw" | "1092kw" | a numeric aggregation id | null). */
  solarGroupLabel?: string | null;
  /** Generating-meter nameplate (840 or 1092) on the rows that define an array; else null. */
  solarKw?: number | null;
  solarFlag?: boolean;
  /** Month NAME (e.g. "May") for the unbilled inventory rows; numeric lives in nem.trueUpMonth. */
  trueUpMonth?: string | number | null;
  nem: FixtureNem | null;
};

/** One fixture meter: the NormalizedMeter fields importMeters reads, plus the meta block. */
type FixtureMeter = NormalizedMeter & { meta?: FixtureMeta };

type BatthRealFixture = {
  account: string;
  farm: string;
  timezone: string;
  meters: FixtureMeter[];
};

/**
 * Read + validate the real-Batth fixture. Resolved from process.cwd() (the repo root the
 * tsx seed and Vitest both run from), NOT import.meta.url, the same convention as
 * src/lib/onboarding/source.ts so the read works under Next's bundled runtime too.
 */
export function loadBatthRealFixture(): BatthRealFixture {
  const path = join(process.cwd(), "fixtures", "batth-real-meters.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as BatthRealFixture;
  if (!Array.isArray(parsed.meters)) {
    throw new Error("batth-real-meters.json: expected a `meters` array");
  }
  return parsed;
}

/** Strip the `meta` block down to the NormalizedMeter shape importMeters consumes. */
function toNormalizedMeter(m: FixtureMeter): NormalizedMeter {
  return {
    serviceId: m.serviceId,
    meterSerial: m.meterSerial,
    accountNumber: m.accountNumber,
    fuel: m.fuel,
    tariff: m.tariff,
    address: m.address,
    intervals: m.intervals,
    summaries: m.summaries as NormalizedSummary[],
  };
}

// Month NAME -> 1-12, for the unbilled inventory rows that print the settle month as a word.
const MONTH_TO_NUM: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Resolve a meter's NEM true-up month to 1-12: numeric (billed) wins, else the month name. */
function trueUpMonthNum(meta: FixtureMeta): number | null {
  if (meta.nem && typeof meta.nem.trueUpMonth === "number") return meta.nem.trueUpMonth;
  const t = meta.trueUpMonth;
  if (typeof t === "number" && t >= 1 && t <= 12) return t;
  if (typeof t === "string") {
    const n = MONTH_TO_NUM[t.trim().toLowerCase()];
    if (n) return n;
  }
  return null;
}

/** The two real arrays the fixture labels with their nameplate ("840kw" / "1092kw"). */
const ARRAY_NAMEPLATE_BY_LABEL: Record<string, number> = { "840kw": 840, "1092kw": 1092 };

/**
 * The [start, close) of the 12-month true-up period that SETTLES in `trueUpMonth` of `settleYear`.
 * NEM true-up is an ANNUAL reconciliation: the statement nets a year of monthly net-metering into one
 * settle figure. The fixture carries only that ANNUAL roll-up (annualNetKwh + trueUpAmountUsd), never
 * the 12 individual months, so we persist ONE NemPeriod row spanning the whole true-up year, dated to
 * close at the settle month. SIMPLIFICATION (documented per the build note): the engine's
 * `summarizeNemMonths` dedupes by calendar month and sums, so a single annual row carries the same
 * net position and charge a full 12-month set would, which is all `nemDemandInsight` reads. The day is
 * pinned to the 1st of the month (no clock); the period spans the prior 12 months up to the settle.
 */
function trueUpYearSpan(
  trueUpMonth: number,
  settleYear: number,
): { start: Date; close: Date } {
  // Close on the 1st of the settle month; start exactly one year earlier (a full true-up cycle).
  const close = new Date(Date.UTC(settleYear, trueUpMonth - 1, 1));
  const start = new Date(Date.UTC(settleYear - 1, trueUpMonth - 1, 1));
  return { start, close };
}

export type SeededBatthReal = Awaited<ReturnType<typeof seedBatthRealFarm>>;

/**
 * Seed the REAL Batth farm into `prisma`. Idempotent for the demo path: clears any prior
 * isDemo Batth-real farm (matched by name) and re-creates it, so it can run repeatedly
 * without piling up duplicates, and never touches a real (isDemo:false) connected account.
 *
 * Renders as the badged representative-data farm at /tour (demoFarm resolves the newest
 * isDemo farm), so it is viewable with zero auth and a down-then-up DB. The recommendation
 * engine is run separately by the runnable seed (prisma/seed.ts), exactly like seedBatthFarm.
 */
export async function seedBatthRealFarm(prisma: PrismaClient) {
  const fx = loadBatthRealFixture();
  const farmName = fx.farm || "Batth Farms";

  // Idempotent: drop a prior real-Batth DEMO farm (by name) so a re-seed is clean. Scoped
  // to isDemo so it can never delete a real onboarded grower's farm of the same name.
  await prisma.farm.deleteMany({ where: { isDemo: true, name: farmName } });

  const farm = await prisma.farm.create({
    data: {
      name: farmName,
      timezone: fx.timezone || "America/Los_Angeles",
      // Badged representative-data farm: viewable at /tour without leaking it as a live
      // grower account on the authed dashboard. Flip to false + set userId to render it
      // as a real connected farm for a signed-in owner (see dashboard-wiring.md).
      isDemo: true,
      // DM4 (Solar tab, FR6): the 840 kW + 1,092 kW = 1,932 kW layout is confirmed ground
      // truth (CLAUDE.md), so the array-code vs nameplate layout is verified up front. This
      // suppresses the Solar tab's "unverified" qualifier on the populated nameplates.
      solarLayoutVerifiedAt: new Date(),
      connections: {
        create: [
          {
            type: "pge_smd",
            status: "active",
            // Real export, but loaded from a committed fixture, not a live authorization.
            source: "sample",
            externalRef: `BATTH-REAL-${fx.account}`,
            authorizedAt: new Date(),
          },
        ],
      },
    },
  });

  // 1) Land the meters/accounts/bills through the SAME importMeters path the live connect
  //    uses. This creates the Pumps (keyed by serviceId), upserts the ~57 Accounts, and
  //    writes the 46 billed cycles' BillingPeriods + reconciled BillingLineItems.
  const normalized = fx.meters.map(toNormalizedMeter);
  const imported = await importMeters(prisma, {
    meters: normalized,
    farmId: farm.id,
    source: "green_button",
  });

  // 2) Apply the per-meter `meta` block onto the landed pumps so the Map (lat/long),
  //    Table (ranch/entity/crop/status/solar/NEM), and Solar (arrays) lenses render.
  //    Resolve Entity/Ranch/Crop lazily, keyed by name, so each is created once.
  const metaByServiceId = new Map<string, FixtureMeta>();
  for (const m of fx.meters) if (m.meta) metaByServiceId.set(m.serviceId, m.meta);

  const entityIdByOwner = new Map<string, string>();
  const ranchIdByName = new Map<string, string>();
  const cropIdByName = new Map<string, string>();
  const arrayIdByLabel = new Map<string, string>();

  const resolveEntity = async (meta: FixtureMeta): Promise<string | null> => {
    const owner = (meta.actualOwner ?? meta.entity ?? "").trim();
    if (!owner) return null;
    const cached = entityIdByOwner.get(owner);
    if (cached) return cached;
    const row = await prisma.entity.create({
      data: {
        farmId: farm.id,
        name: meta.entity ?? owner,
        billingName: meta.entity ?? null,
        actualOwner: owner,
      },
    });
    entityIdByOwner.set(owner, row.id);
    return row.id;
  };

  const resolveRanch = async (name: string | null): Promise<string | null> => {
    const n = name?.trim();
    if (!n) return null;
    const cached = ranchIdByName.get(n);
    if (cached) return cached;
    const row = await prisma.ranch.create({ data: { farmId: farm.id, name: n } });
    ranchIdByName.set(n, row.id);
    return row.id;
  };

  const resolveCrop = async (name: string | null): Promise<string | null> => {
    const n = name?.trim();
    if (!n) return null;
    const cached = cropIdByName.get(n);
    if (cached) return cached;
    // Crop.name is globally unique and shared across farms, so upsert (never create-dup).
    const crop = await prisma.crop.upsert({ where: { name: n }, update: {}, create: { name: n } });
    cropIdByName.set(n, crop.id);
    return crop.id;
  };

  // Build the two real SolarArrays from the generating-meter rows (those carrying solarKw),
  // keyed by the "840kw" / "1092kw" label. Each meter that lists that label is connected.
  const resolveArray = async (
    label: string,
    nameplateKw: number,
    nemType: string | null,
    trueUpMonth: number | null,
    saId: string | null,
  ): Promise<string> => {
    const cached = arrayIdByLabel.get(label);
    if (cached) return cached;
    const row = await prisma.solarArray.create({
      data: {
        farmId: farm.id,
        name: label,
        nameplateKw,
        nemType: nemType ?? undefined,
        trueUpMonth: trueUpMonth ?? undefined,
        saId: saId ?? undefined,
      },
    });
    arrayIdByLabel.set(label, row.id);
    return row.id;
  };

  // Resolve the account each meter bills under, so the Entity links to its Accounts (the
  // dashboard reads entity via Pump.account.entity). Accounts already exist (importMeters
  // upserted them); we only assign their entityId here.
  let pumpsEnriched = 0;
  let nemPeriodsCreated = 0;
  // Settle year for the annual NEM roll-up: the fixture carries no statement YEAR, so we anchor the
  // true-up close to the same year as the (most recent) billed cycles. 2026 here matches the fixture's
  // 2026 cycle dates and the engines' asOf, so the persisted period is contemporaneous, not stale.
  const NEM_SETTLE_YEAR = 2026;
  for (const m of fx.meters) {
    const meta = metaByServiceId.get(m.serviceId);
    if (!meta) continue;
    const pump = await prisma.pump.findUnique({
      where: { farmId_serviceId: { farmId: farm.id, serviceId: m.serviceId } },
      select: { id: true, accountId: true },
    });
    if (!pump) continue; // non-electric or import-skipped: nothing to enrich

    const entityId = await resolveEntity(meta);
    if (entityId && pump.accountId) {
      await prisma.account.update({ where: { id: pump.accountId }, data: { entityId } });
    }
    const ranchId = await resolveRanch(meta.ranch);
    const cropId = await resolveCrop(meta.crop);

    const solarKw =
      typeof meta.solarKw === "number" && meta.solarKw > 0 ? meta.solarKw : null;
    const label = meta.solarGroupLabel?.trim() || null;
    const nameplate = label ? ARRAY_NAMEPLATE_BY_LABEL[label] : undefined;
    const isSolar = Boolean(meta.solarFlag || solarKw != null || nameplate != null);

    await prisma.pump.update({
      where: { id: pump.id },
      data: {
        growerPumpId: meta.growerPumpId ?? undefined,
        latitude: meta.latitude ?? undefined,
        longitude: meta.longitude ?? undefined,
        gpm: meta.gpm ?? undefined,
        status: meta.status ?? undefined,
        nemType: meta.nemType ?? undefined,
        trueUpMonth: trueUpMonthNum(meta) ?? undefined,
        trueUpAmountCents:
          meta.nem && meta.nem.trueUpAmountUsd != null
            ? centsFromDollars(meta.nem.trueUpAmountUsd)
            : undefined,
        solarKw: solarKw ?? undefined,
        isSolar,
        ranchId: ranchId ?? undefined,
        cropId: cropId ?? undefined,
      },
    });
    pumpsEnriched += 1;

    // Persist the annual NEM reconciliation as a NemPeriod row for every billed NEM meter that
    // carries nem data. This is what the canonical solar engine (run-solar-insight.ts ->
    // nemDemandInsight) reads to judge the meter's energy position: a NEGATIVE netKwh = net export.
    // The fixture's `annualNetKwh` already uses that sign convention (verified: the net exporters are
    // negative), so it maps STRAIGHT through to NemPeriod.netKwh with no flip. amountCents comes from
    // trueUpAmountUsd via centsFromDollars (positive = a true-up CHARGE, the engine's convention).
    //
    // This is the data that lets the "net exporter (negative netKwh) yet charged a positive true-up"
    // dispute fire. SIMPLIFICATION: we have only the ANNUAL roll-up, not the 12 monthly statement
    // rows, so we persist ONE row spanning the true-up year (see trueUpYearSpan). The engine sums and
    // dedupes months by calendar bucket, so one annual row yields the same net position + charge as a
    // full month set for its position check. NOTE the engine ALSO gates on isSolar + AG-C family +
    // reconciled demand owed; in today's fixture no meter clears all of those AND is a net exporter,
    // so this row is correct, persisted, and ready, but the dispute does not surface yet (see report).
    const nemMonth = trueUpMonthNum(meta);
    if (
      meta.nem &&
      meta.nem.nemEnrolled &&
      nemMonth != null &&
      (meta.nem.annualNetKwh != null || meta.nem.trueUpAmountUsd != null)
    ) {
      const { start, close } = trueUpYearSpan(nemMonth, NEM_SETTLE_YEAR);
      await prisma.nemPeriod.upsert({
        where: { pumpId_start: { pumpId: pump.id, start } },
        update: {},
        create: {
          pumpId: pump.id,
          start,
          close,
          // Negative = net export (engine convention), straight from the fixture's annual roll-up.
          netKwh: meta.nem.annualNetKwh ?? 0,
          // Positive = a true-up charge; the printed annual settle dollar in integer cents.
          amountCents:
            meta.nem.trueUpAmountUsd != null ? centsFromDollars(meta.nem.trueUpAmountUsd) : 0,
          source: "scanned_bill",
        },
      });
      nemPeriodsCreated += 1;
    }

    // Connect this meter to its array when it lists one of the two known nameplate labels.
    if (label && nameplate != null) {
      const arrayId = await resolveArray(
        label,
        nameplate,
        meta.nemType,
        trueUpMonthNum(meta),
        solarKw != null ? m.serviceId : null,
      );
      await prisma.solarArray.update({
        where: { id: arrayId },
        data: { benefitingMeters: { connect: { id: pump.id } } },
      });
    }
  }

  return {
    id: farm.id,
    name: farm.name,
    account: fx.account,
    metersInFixture: fx.meters.length,
    pumpsCreated: imported.pumpsCreated,
    billingPeriods: imported.billingPeriods,
    metersSkipped: imported.metersSkipped,
    pumpsEnriched,
    nemPeriodsCreated,
    entities: entityIdByOwner.size,
    accounts: new Set(fx.meters.map((m) => m.accountNumber).filter(Boolean)).size,
    ranches: ranchIdByName.size,
    arrays: arrayIdByLabel.size,
  };
}
