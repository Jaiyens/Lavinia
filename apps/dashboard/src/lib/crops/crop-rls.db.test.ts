import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";

// Proves Row Level Security on the crop ledger isolates tenants (the "RLS enforced + tested before
// any second grower" hard rule). The test harness pushes the schema with `prisma db push`, which
// does NOT emit the RLS block — so this test applies the SAME policy SQL itself, then exercises it
// as a NON-superuser role (the harness connects as the `postgres` superuser, which bypasses RLS;
// SET LOCAL ROLE drops to a role for which the policy is enforced).

const RLS_SQL = [
  `ALTER TABLE "ProductionRecord" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ProductionRecord" FORCE ROW LEVEL SECURITY`,
  `CREATE POLICY "ProductionRecord_farm_isolation" ON "ProductionRecord"
     USING ("farmId" = current_setting('app.current_farm_id', true))
     WITH CHECK ("farmId" = current_setting('app.current_farm_id', true))`,
];

let db: TestDb;
let prisma: PrismaClient;
let farmA: string;
let farmB: string;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  // Apply the RLS policy (db push skipped it) and a non-superuser role to exercise it under.
  for (const stmt of RLS_SQL) await prisma.$executeRawUnsafe(stmt);
  await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS crop_rls_tester`);
  await prisma.$executeRawUnsafe(`CREATE ROLE crop_rls_tester NOLOGIN`);
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON "ProductionRecord" TO crop_rls_tester`,
  );

  // Seed one row per farm as the superuser (RLS bypassed for setup).
  const a = await prisma.farm.create({ data: { name: "Farm A" } });
  const b = await prisma.farm.create({ data: { name: "Farm B" } });
  farmA = a.id;
  farmB = b.id;
  await prisma.productionRecord.create({
    data: { farmId: farmA, cropYear: 2026, variety: "Nonpareil", pounds: 100_000, source: "ALMOND_LOGIC" },
  });
  await prisma.productionRecord.create({
    data: { farmId: farmB, cropYear: 2026, variety: "Monterey", pounds: 200_000, source: "ALMOND_LOGIC" },
  });
});

afterAll(async () => {
  await db?.cleanup();
});

/** Run a query as the non-superuser role with app.current_farm_id pinned (or unset if null). */
function asTenant<T>(
  farmId: string | null,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE crop_rls_tester`);
    if (farmId !== null) {
      await tx.$executeRaw`SELECT set_config('app.current_farm_id', ${farmId}, true)`;
    }
    return fn(tx as unknown as PrismaClient);
  });
}

describe("crop ledger RLS", () => {
  it("a tenant sees only its own rows", async () => {
    const aRows = await asTenant(farmA, (tx) => tx.productionRecord.findMany());
    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.farmId).toBe(farmA);

    const bRows = await asTenant(farmB, (tx) => tx.productionRecord.findMany());
    expect(bRows).toHaveLength(1);
    expect(bRows[0]?.farmId).toBe(farmB);
  });

  it("a connection with no farm set sees zero rows (fail closed)", async () => {
    const rows = await asTenant(null, (tx) => tx.productionRecord.findMany());
    expect(rows).toHaveLength(0);
  });

  it("cannot write a row under another farm (WITH CHECK)", async () => {
    await expect(
      asTenant(farmB, (tx) =>
        tx.productionRecord.create({
          data: { farmId: farmA, cropYear: 2026, variety: "X", pounds: 1, source: "ALMOND_LOGIC" },
        }),
      ),
    ).rejects.toThrow();
  });
});
