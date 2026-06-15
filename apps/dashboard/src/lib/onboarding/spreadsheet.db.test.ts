import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  type ConnectResult,
  connectSpreadsheet,
  createFarmFromConnection,
  importInventory,
} from "./farm";
import { parseInventory } from "@/lib/spreadsheet";

// Integration test: land the master meter list through Prisma against a throwaway Postgres
// db (no network, never touches the dev/prod db). Same harness as onboarding.db.test.ts.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const masterCsv = readFileSync(
  resolve(repoRoot, "fixtures/spreadsheet/batth-master.csv"),
  "utf8",
);
const sampleCsv = readFileSync(
  resolve(repoRoot, "fixtures/spreadsheet/sample-batth.csv"),
  "utf8",
);

let db: TestDb;
let prisma: PrismaClient;
let connect: ConnectResult;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  connect = await connectSpreadsheet(prisma, { csv: masterCsv, name: "Batth Farms" });
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("connectSpreadsheet, the whole 183-meter Batth inventory (FR-1)", () => {
  it("creates a named farm with a pending PG&E connection", async () => {
    const farm = await prisma.farm.findUniqueOrThrow({
      where: { id: connect.farmId },
      include: { connections: true },
    });
    expect(farm.name).toBe("Batth Farms");
    expect(farm.connections[0]?.type).toBe("pge_smd");
    expect(farm.connections[0]?.status).toBe("pending");
  });

  it("lands all 183 meters, classified pump vs non-pump from the Kind column", async () => {
    expect(connect.pumps).toBe(183);
    expect(connect.pumpsClassified).toBe(174);
    expect(connect.nonPumpsClassified).toBe(9);
    expect(await prisma.pump.count({ where: { farmId: connect.farmId } })).toBe(183);
  });

  it("dedupes 7 billing-name variants to 6 entities (AC1)", async () => {
    expect(await prisma.entity.count({ where: { farmId: connect.farmId } })).toBe(6);

    // The two "Batth Farms" spellings collapse to ONE entity that owns all 15 of its
    // accounts; billingName keeps the first-seen variant, actualOwner is canonical.
    const batth = await prisma.entity.findFirstOrThrow({
      where: { farmId: connect.farmId, actualOwner: "Batth Farms LLC" },
      include: { accounts: true },
    });
    expect(batth.billingName).toBe("Batth Farms LLC");
    expect(batth.accounts).toHaveLength(15);
  });

  it("builds Entity -> Account -> Ranch -> Meter (AC2)", async () => {
    expect(await prisma.account.count({ where: { farmId: connect.farmId } })).toBe(57);
    expect(await prisma.ranch.count({ where: { farmId: connect.farmId } })).toBe(19);

    const account = await prisma.account.findFirstOrThrow({
      where: { farmId: connect.farmId, number: "07300000000" },
      include: { entity: true },
    });
    expect(account.entity?.actualOwner).toBe("Batth Farms LLC");

    const p1 = await prisma.pump.findFirstOrThrow({
      where: { farmId: connect.farmId, growerPumpId: "P001" },
      include: { ranch: true, account: true, crop: true },
    });
    expect(p1.ranch?.name).toBe("Home Ranch");
    expect(p1.crop?.name).toBe("Pistachios"); // meter-level crop carried (FR-1)
    expect(p1.latitude).toBeCloseTo(36.51); // lat/long carried where present
    expect(p1.serialCode).toBe("2-02");
    expect(p1.billingSerial).toBe("2-02"); // kept in sync with serialCode
    expect(p1.status).toBe("BAD"); // FR-17 pump health, not kind
  });

  it("stores the rate schedule verbatim and flags legacy meters (AC4, FR-17)", async () => {
    const legacy = await prisma.pump.findFirstOrThrow({
      where: { farmId: connect.farmId, growerPumpId: "P012" },
    });
    expect(legacy.rateSchedule).toBe("AG-5B"); // stored exactly as read, never rewritten
    expect(legacy.isLegacy).toBe(true);

    // Explicit Legacy column wins over the (non-legacy) rate.
    const explicit = await prisma.pump.findFirstOrThrow({
      where: { farmId: connect.farmId, growerPumpId: "P003" },
    });
    expect(explicit.rateSchedule).toBe("B-1");
    expect(explicit.isLegacy).toBe(true);
    expect(explicit.status).toBe("OLD");

    expect(
      await prisma.pump.count({ where: { farmId: connect.farmId, isLegacy: true } }),
    ).toBeGreaterThanOrEqual(27);
  });

  it("models solar as an Array -> benefiting-Meter NEMA graph, not flat flags (AC3)", async () => {
    expect(await prisma.solarArray.count({ where: { farmId: connect.farmId } })).toBe(2);

    const arrayA = await prisma.solarArray.findFirstOrThrow({
      where: { farmId: connect.farmId, name: "AGG-A" },
      include: { benefitingMeters: true },
    });
    expect(arrayA.nameplateKw).toBe(840);
    expect(arrayA.trueUpMonth).toBe(4); // April, per-array true-up
    expect(arrayA.benefitingMeters).toHaveLength(6);

    const arrayB = await prisma.solarArray.findFirstOrThrow({
      where: { farmId: connect.farmId, name: "AGG-B" },
    });
    expect(arrayB.nameplateKw).toBe(1092);
    expect(arrayB.trueUpMonth).toBe(10); // October

    // The meter on aggregation from BOTH arrays proves the many-to-many resolves.
    const both = await prisma.pump.findFirstOrThrow({
      where: { farmId: connect.farmId, growerPumpId: "P060" },
      include: { benefitingArrays: true },
    });
    expect(both.benefitingArrays).toHaveLength(2);
    expect(both.benefitingArrays.map((a) => a.name).sort()).toEqual(["AGG-A", "AGG-B"]);
  });

  it("is idempotent: re-importing updates in place, no duplicate rows (AC5)", async () => {
    const { rows } = parseInventory(masterCsv);
    const again = await importInventory(prisma, { rows, farmId: connect.farmId });
    expect(again.pumpsCreated).toBe(0);
    expect(again.pumpsUpdated).toBe(183);
    expect(again.entities).toBe(6);
    expect(again.ranches).toBe(19);
    expect(again.arrays).toBe(2);
    expect(await prisma.pump.count({ where: { farmId: connect.farmId } })).toBe(183);
    expect(await prisma.entity.count({ where: { farmId: connect.farmId } })).toBe(6);
    expect(await prisma.account.count({ where: { farmId: connect.farmId } })).toBe(57);
    expect(await prisma.solarArray.count({ where: { farmId: connect.farmId } })).toBe(2);
  });
});

describe("connectSpreadsheet, the small sample fixture still lands cleanly", () => {
  it("creates 3 entities, links accounts, and reads solar + status", async () => {
    const sample = await connectSpreadsheet(prisma, { csv: sampleCsv, name: "Sample Farm" });
    expect(sample.pumps).toBe(6);
    expect(await prisma.entity.count({ where: { farmId: sample.farmId } })).toBe(3);

    const well = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: sample.farmId, serviceId: "1007066742" } },
      include: { account: true, ranch: true },
    });
    expect(well.rateSchedule).toBe("AG-C");
    expect(well.serialCode).toBe("3-07");
    expect(well.gpm).toBe(1200);
    expect(well.status).toBe("GOOD");
    expect(well.account?.number).toBe("07302408880");
    expect(well.ranch?.name).toBe("Home Ranch");

    const solar = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: sample.farmId, serviceId: "1010898065" } },
    });
    expect(solar.solarKw).toBe(840);
    expect(solar.isSolar).toBe(true);
    expect(solar.trueUpMonth).toBe(4);
  });
});

describe("importInventory, NEMA edge shapes and crop normalization", () => {
  const twinCsv = [
    "Legal Entity,SA ID,Pump Name,Rate Schedule,Crop,Status,Kind,NEMA,Net Metering,Solar kW,True-Up Month",
    "Twin Array Farm,5000000001,Twin Gen,NEMEXPM,almonds,GOOD,non_pump,TWIN-A;TWIN-B,nem2,1500,April",
    "Twin Array Farm,5000000002,Twin Benef 1,AG-C,almonds,GOOD,pump,TWIN-A,,,",
    "Twin Array Farm,5000000003,Twin Benef 2,AG-C,walnuts,GOOD,pump,TWIN-B,,,",
    "Twin Array Farm,5000000004,Orphan Benef,AG-C,walnuts,GOOD,pump,GHOST,,,",
  ].join("\n");

  it("keeps a multi-code generator's nameplate, surfaces orphan codes, normalizes crops", async () => {
    const { farmId } = await createFarmFromConnection(prisma, { name: "Twin Array Farm" });
    const { rows } = parseInventory(twinCsv);
    const res = await importInventory(prisma, { rows, farmId });

    // A generator listing two NEMA codes (1500 kW) defines BOTH arrays (no nameplate loss).
    expect(res.arrays).toBe(2);
    const a = await prisma.solarArray.findFirstOrThrow({
      where: { farmId, name: "TWIN-A" },
      include: { benefitingMeters: true },
    });
    const b = await prisma.solarArray.findFirstOrThrow({ where: { farmId, name: "TWIN-B" } });
    expect(a.nameplateKw).toBe(1500);
    expect(b.nameplateKw).toBe(1500);
    expect(a.benefitingMeters).toHaveLength(2); // the generator + Twin Benef 1

    // A NEMA code with no generating row is surfaced, never silently dropped (NFR-4).
    expect(res.unlinkedNemaCodes).toEqual(["GHOST"]);
    const orphan = await prisma.pump.findFirstOrThrow({
      where: { farmId, serviceId: "5000000004" },
      include: { benefitingArrays: true },
    });
    expect(orphan.benefitingArrays).toHaveLength(0); // meter persists, just no array link

    // Crop names canonicalize to the shared-catalog form ("almonds" -> "Almonds").
    const benef = await prisma.pump.findFirstOrThrow({
      where: { farmId, serviceId: "5000000002" },
      include: { crop: true },
    });
    expect(benef.crop?.name).toBe("Almonds");
  });
});
