import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCropLedger } from "../../../prisma/crop-ledger-fixture";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { loadCropLedger } from "./load";
import { recomputePositions } from "./positions";
import { withFarmTenant } from "./tenant-db";

// Proves the money logic end-to-end through the DB edge: the hand-entered fixture -> withFarmTenant
// write -> loadCropLedger -> recomputePositions returns the known position to the pound, and a
// settlement supersedes an estimate append-only (both rows physically present). Throwaway Postgres
// on the local cluster (db push, so RLS is NOT applied here — isolation is tested in crop-rls.db.test).

let db: TestDb;
let prisma: PrismaClient;
let farmId: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  const farm = await prisma.farm.create({ data: { name: "Crop Test Farm" } });
  farmId = farm.id;
  await seedCropLedger(prisma, farmId);
});

afterAll(async () => {
  await db?.cleanup();
});

describe("crop ledger end-to-end (fixture -> load -> recompute)", () => {
  it("returns the known 2026 position to the pound", async () => {
    const ledger = await loadCropLedger(prisma, farmId);
    const positions = recomputePositions(ledger);

    const nonpareil = positions.find((p) => p.variety === "Nonpareil");
    const monterey = positions.find((p) => p.variety === "Monterey");

    expect(nonpareil).toMatchObject({
      cropYear: 2026,
      producedPounds: 248_500, // settled wins over the 240,000 estimate
      committedPounds: 150_000,
      poolPounds: 50_000,
      unsoldPounds: 48_500,
      estimateToSettledGapPounds: 8_500,
      isSettled: true,
    });
    expect(monterey).toMatchObject({
      cropYear: 2026,
      producedPounds: 120_000,
      committedPounds: 60_000,
      poolPounds: 0,
      unsoldPounds: 60_000,
      estimateToSettledGapPounds: null,
      isSettled: false,
    });
  });

  it("is append-only: the superseded estimate row is still physically present", async () => {
    const rows = await withFarmTenant(prisma, farmId, (tx) =>
      tx.productionRecord.findMany({ where: { farmId, variety: "Nonpareil" } }),
    );
    expect(rows).toHaveLength(2); // the estimate AND the settlement both persist
    const settlement = rows.find((r) => r.source === "PACKER_SETTLED");
    const estimate = rows.find((r) => r.source === "ALMOND_LOGIC");
    expect(settlement?.supersedesId).toBe(estimate?.id);
  });

  it("refuses to delete an estimate out from under its settlement (onDelete: Restrict)", async () => {
    const estimate = await withFarmTenant(prisma, farmId, (tx) =>
      tx.productionRecord.findFirst({ where: { farmId, variety: "Nonpareil", source: "ALMOND_LOGIC" } }),
    );
    await expect(
      withFarmTenant(prisma, farmId, (tx) =>
        tx.productionRecord.delete({ where: { id: estimate!.id } }),
      ),
    ).rejects.toThrow();
  });
});
