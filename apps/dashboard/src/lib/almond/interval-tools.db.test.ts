import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  getMeterDemandHistory,
  getMeterIntervalStats,
  getMeterPeakInterval,
  type IntervalToolDeps,
} from "./interval-tools";

/**
 * Integration test for the interval read tools over a throwaway Postgres database (the local test
 * cluster, never dev/prod Neon). Proves the executors actually reach UsageInterval and reduce it
 * correctly: the single peak interval and its timestamp, the TOU split, the per-cycle demand
 * history, and the resolution branches (found / ambiguous / none / no_data). Authored for CI/e2e;
 * the offline pass skips it (local Postgres is unavailable there).
 *
 * Assertions are timezone-independent on purpose (peak kW + ISO timestamp, TOU-by-code, billing
 * rows) so the test never depends on the bucketing timezone. Hour/weekday/month bucketing is proven
 * in the pure interval-stats.test.ts with an explicit zone.
 */

let db: TestDb;
let prisma: PrismaClient;
let deps: IntervalToolDeps;

// West Pump 1: a clear 5pm (UTC) demand spike of 120 kW, an EXPORT reading that must never win the
// peak, and an off-peak tail the next day. durationSec defaults to 900s, so kW = kWh * 4.
const WEST = "West Pump 1";

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const farm = await prisma.farm.create({ data: { name: "Interval Test Farm" } });
  deps = { prisma, farmId: farm.id };

  const west = await prisma.pump.create({ data: { name: WEST, farmId: farm.id } });
  await prisma.pump.create({ data: { name: "East Pump", farmId: farm.id } }); // no intervals -> no_data
  // Two "North Pump" meters so a bare "north pump" query is ambiguous (resolveMeterQuery asks).
  await prisma.pump.create({ data: { name: "North Pump A", farmId: farm.id } });
  await prisma.pump.create({ data: { name: "North Pump B", farmId: farm.id } });

  await prisma.usageInterval.createMany({
    data: [
      { pumpId: west.id, start: new Date("2026-06-01T00:00:00Z"), kWh: 2, touCode: "WOP" }, // 8 kW off
      { pumpId: west.id, start: new Date("2026-06-01T17:00:00Z"), kWh: 30, touCode: "WPK" }, // 120 kW PEAK
      { pumpId: west.id, start: new Date("2026-06-01T17:15:00Z"), kWh: 10, touCode: "WPK" }, // 40 kW peak
      {
        pumpId: west.id,
        start: new Date("2026-06-01T17:30:00Z"),
        kWh: 100, // 400 kW, but EXPORT — must be excluded from peak and usage
        direction: "export",
        touCode: "WPK",
      },
      { pumpId: west.id, start: new Date("2026-06-02T03:00:00Z"), kWh: 4, touCode: "WOP" }, // 16 kW off
    ],
  });

  await prisma.billingPeriod.createMany({
    data: [
      {
        pumpId: west.id,
        start: new Date("2026-05-01T00:00:00Z"),
        close: new Date("2026-05-31T00:00:00Z"),
        peakKw: 150,
        peakAt: new Date("2026-05-20T18:00:00Z"),
        demandChargeUsd: 3000, // implies $20/kW (3000 / 150)
        tariff: "AG-C",
      },
      {
        pumpId: west.id,
        start: new Date("2026-06-01T00:00:00Z"),
        close: new Date("2026-06-30T00:00:00Z"),
        peakKw: 120,
        peakAt: new Date("2026-06-01T17:00:00Z"),
        demandChargeUsd: null, // no charge on file -> implied $/kW is null
        tariff: "AG-C",
      },
    ],
  });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("getMeterPeakInterval", () => {
  it("finds the single largest 15-minute kW interval and exactly when it happened", async () => {
    const result = await getMeterPeakInterval(deps, { meter: WEST });
    if (!result.found) throw new Error(`expected found, got ${JSON.stringify(result)}`);
    expect(result.meterName).toBe(WEST);
    expect(result.peak).toEqual({ kw: 120, at: "2026-06-01T17:00:00.000Z" });
    // Export reading (400 kW) is excluded; import count is 4, not 5.
    expect(result.intervalCount).toBe(4);
    expect(result.window.start).toBe("2026-06-01T00:00:00.000Z");
    expect(result.window.end).toBe("2026-06-02T03:00:00.000Z");
    expect(result.truncated).toBe(false);
  });

  it("honours a time window (a later window sees only the off-peak tail)", async () => {
    const result = await getMeterPeakInterval(deps, {
      meter: WEST,
      window: { from: "2026-06-02T00:00:00Z" },
    });
    if (!result.found) throw new Error(`expected found, got ${JSON.stringify(result)}`);
    expect(result.peak.kw).toBe(16);
    expect(result.intervalCount).toBe(1);
  });

  it("reports no_data for a meter with no intervals", async () => {
    const result = await getMeterPeakInterval(deps, { meter: "East Pump" });
    expect(result).toEqual({ found: false, reason: "no_data", meterName: "East Pump" });
  });

  it("reports none for an unknown meter and asks on an ambiguous name", async () => {
    expect(await getMeterPeakInterval(deps, { meter: "Nonexistent" })).toEqual({
      found: false,
      reason: "none",
    });
    const ambiguous = await getMeterPeakInterval(deps, { meter: "north pump" });
    if (ambiguous.found || ambiguous.reason !== "ambiguous") {
      throw new Error(`expected ambiguous, got ${JSON.stringify(ambiguous)}`);
    }
    expect(ambiguous.candidates).toEqual(
      expect.arrayContaining(["North Pump A", "North Pump B"]),
    );
  });
});

describe("getMeterIntervalStats", () => {
  it("splits usage into TOU periods (export excluded, unlabeled folds off-peak)", async () => {
    const result = await getMeterIntervalStats(deps, { meter: WEST, groupBy: "touPeriod" });
    if (!result.found) throw new Error(`expected found, got ${JSON.stringify(result)}`);
    const byKey = new Map(result.buckets.map((b) => [b.key, b]));
    expect(byKey.get("peak")?.kWh).toBe(40); // 30 + 10, both WPK
    expect(byKey.get("partial_peak")?.kWh).toBe(0);
    expect(byKey.get("off_peak")?.kWh).toBe(6); // 2 + 4, WOP
    expect(byKey.get("peak")?.share).toBeCloseTo(40 / 46, 10); // export's 100 not in the total
    expect(result.summary.totalKwh).toBe(46);
    expect(result.summary.peak).toEqual({ kw: 120, at: "2026-06-01T17:00:00.000Z" });
  });

  it("reports no_data for a meter with no intervals", async () => {
    const result = await getMeterIntervalStats(deps, { meter: "East Pump", groupBy: "hour" });
    expect(result).toEqual({ found: false, reason: "no_data", meterName: "East Pump" });
  });
});

describe("getMeterDemandHistory", () => {
  it("lists each cycle's peak, when it occurred, and the implied $/kW, newest first", async () => {
    const result = await getMeterDemandHistory(deps, { meter: WEST });
    if (!result.found) throw new Error(`expected found, got ${JSON.stringify(result)}`);
    const [june, may] = result.cycles;
    if (!june || !may) throw new Error(`expected two cycles, got ${JSON.stringify(result.cycles)}`);
    expect(june.peakKw).toBe(120);
    expect(june.peakAt).toBe("2026-06-01T17:00:00.000Z");
    expect(june.demandChargeUsd).toBeNull();
    expect(june.impliedDollarsPerKw).toBeNull(); // no charge -> no implied rate
    expect(may.peakKw).toBe(150);
    expect(may.demandChargeUsd).toBe(3000);
    expect(may.impliedDollarsPerKw).toBe(20); // 3000 / 150
    expect(may.tariff).toBe("AG-C");
  });

  it("returns an empty cycle list (still found) for a meter with no bills", async () => {
    const result = await getMeterDemandHistory(deps, { meter: "East Pump" });
    expect(result).toEqual({ found: true, meterName: "East Pump", cycles: [] });
  });

  it("reports none for an unknown meter", async () => {
    expect(await getMeterDemandHistory(deps, { meter: "Nonexistent" })).toEqual({
      found: false,
      reason: "none",
    });
  });
});
