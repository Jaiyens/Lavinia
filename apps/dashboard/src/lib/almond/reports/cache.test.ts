import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { computeCacheKey, computeFarmDataFingerprint } from "./cache";

/**
 * Pure unit tests for the content-addressed cache key + the farm-data fingerprint (zero external
 * calls: the fingerprint's three aggregates are faked). The roundtrip (store -> lookup -> stream
 * bytes) touches Postgres + Blob and is exercised by a db/integration run; here we pin the two
 * properties the cache's correctness rests on: an identical ask on unchanged data yields the SAME
 * key, and ANY data or request change yields a DIFFERENT key.
 */

type Agg = { pumpCount: number; pumpMax: Date | null; periodCount: number; periodMax: Date | null; periodSum: number | null; recCount: number; recMax: Date | null };

const BASE: Agg = {
  pumpCount: 183,
  pumpMax: new Date("2026-06-20T00:00:00.000Z"),
  periodCount: 900,
  periodMax: new Date("2026-06-19T00:00:00.000Z"),
  periodSum: 12_345_678,
  recCount: 12,
  recMax: new Date("2026-06-18T00:00:00.000Z"),
};

function fakePrisma(a: Agg): PrismaClient {
  return {
    pump: { aggregate: async () => ({ _count: { _all: a.pumpCount }, _max: { updatedAt: a.pumpMax } }) },
    billingPeriod: {
      aggregate: async () => ({ _count: { _all: a.periodCount }, _max: { createdAt: a.periodMax }, _sum: { printedTotalCents: a.periodSum } }),
    },
    recommendation: { aggregate: async () => ({ _count: { _all: a.recCount }, _max: { createdAt: a.recMax } }) },
  } as unknown as PrismaClient;
}

const fp = (a: Agg) => computeFarmDataFingerprint(fakePrisma(a), "farm_1");

describe("computeFarmDataFingerprint", () => {
  it("is stable for identical data", async () => {
    expect(await fp(BASE)).toBe(await fp({ ...BASE }));
  });

  it("changes when a meter is added/removed (pump count)", async () => {
    expect(await fp({ ...BASE, pumpCount: 184 })).not.toBe(await fp(BASE));
  });

  it("changes when a meter is edited (pump max updatedAt moves)", async () => {
    expect(await fp({ ...BASE, pumpMax: new Date("2026-06-21T00:00:00.000Z") })).not.toBe(await fp(BASE));
  });

  it("changes when a bill VALUE changes even with the same row count (the summed dollars move)", async () => {
    expect(await fp({ ...BASE, periodSum: 12_345_679 })).not.toBe(await fp(BASE));
  });

  it("changes when a finding is added (recommendation count)", async () => {
    expect(await fp({ ...BASE, recCount: 13 })).not.toBe(await fp(BASE));
  });
});

describe("computeCacheKey", () => {
  const args = { farmId: "farm_1", fingerprint: "fp_abc", skill: "export" as const, request: { table: "workbook", filterKey: null, filterValue: null } };

  it("is deterministic for identical inputs", () => {
    expect(computeCacheKey(args)).toBe(computeCacheKey({ ...args }));
  });

  it("is independent of request key ORDER (canonicalized)", () => {
    const a = computeCacheKey({ ...args, request: { table: "workbook", filterKey: null, filterValue: null } });
    const b = computeCacheKey({ ...args, request: { filterValue: null, filterKey: null, table: "workbook" } });
    expect(a).toBe(b);
  });

  it("changes when the request changes", () => {
    expect(computeCacheKey({ ...args, request: { table: "meters", filterKey: null, filterValue: null } })).not.toBe(
      computeCacheKey(args),
    );
  });

  it("changes when the farm data fingerprint changes", () => {
    expect(computeCacheKey({ ...args, fingerprint: "fp_xyz" })).not.toBe(computeCacheKey(args));
  });

  it("changes when the skill changes (no cross-skill collision)", () => {
    expect(computeCacheKey({ ...args, skill: "report" })).not.toBe(computeCacheKey(args));
  });

  it("is farm-scoped (different farm, different key)", () => {
    expect(computeCacheKey({ ...args, farmId: "farm_2" })).not.toBe(computeCacheKey(args));
  });
});
