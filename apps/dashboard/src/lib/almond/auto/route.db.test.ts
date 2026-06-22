import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedSampleFarm } from "../../../../prisma/sample-farm";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { AlmondToolDeps } from "../tools";
import { computeCacheKey, computeFarmDataFingerprint } from "../reports/cache";
import { storeReport } from "../reports/store";
import { resolveReportParams } from "../skills/generate-report";
import { resolveExportParams } from "../skills/export-spreadsheet";
import { probeAutoCache } from "./route";

// Integration test (.db.test.ts -> excluded from CI): proves probeAutoCache predicts a real cache HIT
// vs MISS against Postgres on the local test cluster (src/test/pg-harness.ts), never the dev/prod Neon
// db. A row stored under the REPORT skill's content-addressed key is a HIT for the same report request
// and a MISS for the export request (a different cache namespace -> a different key).

// Mock the Blob storage seam (exactly as tools.db.test.ts / route.db.test.ts do) so storeReport's
// putPrivateBlob never reaches the real Vercel Blob store and lookupCachedReport's getPrivateBlob
// returns deterministic bytes — the offline path has zero real-network surface.
const FAKE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // a tiny "PK.." zip header
vi.mock("@/lib/storage/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/blob")>();
  return {
    ...actual,
    putPrivateBlob: vi.fn(async (pathname: string) => ({ pathname, byteSize: FAKE_BYTES.byteLength })),
    getPrivateBlob: vi.fn(async () => ({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(FAKE_BYTES);
          controller.close();
        },
      }),
      contentType: "application/pdf",
      byteSize: FAKE_BYTES.byteLength,
    })),
  };
});

let db: TestDb;
let prisma: PrismaClient;
let deps: AlmondToolDeps;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await seedSampleFarm(prisma);
  deps = { prisma, farmId: farm.id, farmName: farm.name, meterUserId: null };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("probeAutoCache over the content-addressed report cache", () => {
  it("is a HIT for the report request it was stored under, and a MISS for the export request", async () => {
    const reportRequest = resolveReportParams({});
    const exportRequest = resolveExportParams({});

    // Before any row exists, both skills miss.
    expect(await probeAutoCache(deps, "report", reportRequest)).toBe(false);
    expect(await probeAutoCache(deps, "export", exportRequest)).toBe(false);

    // Persist a report under the SAME content-addressed key the cache (and the router) computes:
    // (farmId, current fingerprint, "report", reportRequest).
    const fingerprint = await computeFarmDataFingerprint(prisma, deps.farmId);
    const cacheKey = computeCacheKey({
      farmId: deps.farmId,
      fingerprint,
      skill: "report",
      request: reportRequest,
    });
    await storeReport(
      { prisma, farmId: deps.farmId, createdById: null },
      {
        kind: "report",
        title: "sample-farm-report.pdf",
        requestText: "make me a pdf report",
        coverageAsOf: null,
        params: reportRequest,
        bytes: FAKE_BYTES,
        contentType: "application/pdf",
        cacheKey,
        meterCount: 0,
      },
    );

    // Now the report request is a HIT (same key), while the export request stays a MISS — a different
    // skill namespace yields a different key, so a stored report never satisfies an export probe.
    expect(await probeAutoCache(deps, "report", reportRequest)).toBe(true);
    expect(await probeAutoCache(deps, "export", exportRequest)).toBe(false);
  });
});
