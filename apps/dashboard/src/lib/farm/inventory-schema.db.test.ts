import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import type { PumpStatus } from "@/lib/recommendations/types";

// Integration test for the Story 1.1 inventory ontology: build the evolved schema
// into a throwaway Postgres database on the local test cluster (never touches the
// dev/prod db) and confirm every new relation round-trips both directions: Entity
// billingName/actualOwner, the Ranch rollup, the meter-level crop, and the
// SolarArray -> benefiting-Meter (NEMA) many-to-many graph.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("farm inventory ontology (Story 1.1)", () => {
  it("stores the full Entity -> Account -> Ranch -> Meter hierarchy and the NEMA graph", async () => {
    const farm = await prisma.farm.create({ data: { name: "Schema Test Farm", isDemo: true } });

    // Entity carries both the billing name and the true legal owner.
    const entity = await prisma.entity.create({
      data: {
        name: "Batth Farms LLC",
        billingName: "BATTH FARM'S LLC", // the PG&E-printed variant
        actualOwner: "Batth Farms, LLC", // the true legal owner
        farmId: farm.id,
      },
    });
    expect(entity.billingName).toBe("BATTH FARM'S LLC");
    expect(entity.actualOwner).toBe("Batth Farms, LLC");

    const account = await prisma.account.create({
      data: { number: "5500000001", farmId: farm.id, entityId: entity.id },
    });

    const crop = await prisma.crop.create({ data: { name: "Almonds (schema test)" } });

    // Ranch is the rollup level, tied to the farm and a crop.
    const ranch = await prisma.ranch.create({
      data: { name: "Westside Ranch", acreage: 120, farmId: farm.id, cropId: crop.id },
    });

    // A meter carrying every new inventory attribute. serialCode and
    // rotatingOutageBlock must be two genuinely distinct values.
    const badStatus: PumpStatus = "BAD";
    const pumpA = await prisma.pump.create({
      data: {
        name: "Westside Well 1",
        serviceId: "8412345678", // SA ID
        meterSerial: "1099999999", // meter #
        growerPumpId: "P012", // grower's Pump ID descriptor
        rateSchedule: "AG-4B",
        isLegacy: true,
        status: badStatus,
        isSolar: true,
        serialCode: "MR-07",
        rotatingOutageBlock: "B14",
        farmId: farm.id,
        accountId: account.id,
        cropId: crop.id,
        ranchId: ranch.id,
      },
    });
    const pumpB = await prisma.pump.create({
      data: {
        name: "Westside Well 2",
        serviceId: "8412345679",
        farmId: farm.id,
        accountId: account.id,
        ranchId: ranch.id,
        isSolar: true,
      },
    });

    // A solar array whose credits offset both meters (the NEMA allocation graph).
    const array = await prisma.solarArray.create({
      data: {
        name: "North Array",
        nameplateKw: 840,
        nemType: "nem2_agg",
        trueUpMonth: 4,
        saId: "8499999999",
        farmId: farm.id,
        benefitingMeters: { connect: [{ id: pumpA.id }, { id: pumpB.id }] },
      },
    });
    expect(array.trueUpMonth).toBe(4);

    // The meter's own attributes persist, with serialCode distinct from the outage block.
    const meter = await prisma.pump.findUniqueOrThrow({
      where: { id: pumpA.id },
      include: { ranch: { include: { crop: true } }, crop: true, account: { include: { entity: true } } },
    });
    expect(meter.growerPumpId).toBe("P012");
    expect(meter.isLegacy).toBe(true);
    expect(meter.status).toBe("BAD");
    expect(meter.isSolar).toBe(true);
    expect(meter.serialCode).toBe("MR-07");
    expect(meter.rotatingOutageBlock).toBe("B14");
    expect(meter.serialCode).not.toBe(meter.rotatingOutageBlock);
    // Defaults applied to pumpB where the meter did not set them.
    const meterB = await prisma.pump.findUniqueOrThrow({ where: { id: pumpB.id } });
    expect(meterB.isLegacy).toBe(false);
    expect(meterB.status).toBeNull();

    // Rollup resolves down: Meter -> Ranch -> Crop, and Meter -> Account -> Entity.
    expect(meter.ranch?.name).toBe("Westside Ranch");
    expect(meter.ranch?.crop?.name).toBe("Almonds (schema test)");
    expect(meter.crop?.name).toBe("Almonds (schema test)");
    expect(meter.account?.entity?.actualOwner).toBe("Batth Farms, LLC");

    // Rollup resolves up: Ranch -> its meters.
    const ranchWithPumps = await prisma.ranch.findUniqueOrThrow({
      where: { id: ranch.id },
      include: { pumps: true },
    });
    expect(ranchWithPumps.pumps).toHaveLength(2);

    // NEMA many-to-many resolves both directions.
    const arrayWithMeters = await prisma.solarArray.findUniqueOrThrow({
      where: { id: array.id },
      include: { benefitingMeters: true },
    });
    expect(arrayWithMeters.benefitingMeters).toHaveLength(2);
    expect(arrayWithMeters.benefitingMeters.map((m) => m.id).sort()).toEqual(
      [pumpA.id, pumpB.id].sort(),
    );

    const meterWithArrays = await prisma.pump.findUniqueOrThrow({
      where: { id: pumpA.id },
      include: { benefitingArrays: true },
    });
    expect(meterWithArrays.benefitingArrays).toHaveLength(1);
    expect(meterWithArrays.benefitingArrays[0]?.nameplateKw).toBe(840);

    // Cascade cleanup: deleting the farm removes its entities, accounts, ranches,
    // pumps, and solar arrays (and the implicit NEMA join rows). Crops are global.
    await prisma.farm.delete({ where: { id: farm.id } });
    expect(await prisma.pump.count()).toBe(0);
    expect(await prisma.ranch.count()).toBe(0);
    expect(await prisma.solarArray.count()).toBe(0);
    expect(await prisma.entity.count()).toBe(0);
    await prisma.crop.delete({ where: { id: crop.id } });
  }, 60_000);

  it("honors SetNull relations and independent many-to-many deletes", async () => {
    const farm = await prisma.farm.create({ data: { name: "SetNull Test Farm", isDemo: true } });
    const entity = await prisma.entity.create({ data: { name: "SetNull Entity", farmId: farm.id } });
    const account = await prisma.account.create({
      data: { number: "5500000099", farmId: farm.id, entityId: entity.id },
    });
    const crop = await prisma.crop.create({ data: { name: "Pistachios (setnull test)" } });
    const ranch = await prisma.ranch.create({
      data: { name: "East Ranch", farmId: farm.id, cropId: crop.id },
    });
    const pump = await prisma.pump.create({
      data: {
        name: "East Well 1",
        farmId: farm.id,
        accountId: account.id,
        cropId: crop.id,
        ranchId: ranch.id,
      },
    });
    const array = await prisma.solarArray.create({
      data: {
        name: "East Array",
        nameplateKw: 1092,
        farmId: farm.id,
        benefitingMeters: { connect: [{ id: pump.id }] },
      },
    });

    // Deleting one solar array removes only its NEMA join rows, not the benefiting meter.
    await prisma.solarArray.delete({ where: { id: array.id } });
    const afterArrayDelete = await prisma.pump.findUniqueOrThrow({
      where: { id: pump.id },
      include: { benefitingArrays: true },
    });
    expect(afterArrayDelete.benefitingArrays).toHaveLength(0);

    // Deleting a referenced Ranch nulls Pump.ranchId (SetNull); it does not delete the meter.
    await prisma.ranch.delete({ where: { id: ranch.id } });
    const afterRanchDelete = await prisma.pump.findUniqueOrThrow({ where: { id: pump.id } });
    expect(afterRanchDelete.ranchId).toBeNull();
    expect(await prisma.ranch.count()).toBe(0);

    // Deleting the meter-level Crop nulls Pump.cropId (SetNull); the meter survives.
    await prisma.crop.delete({ where: { id: crop.id } });
    const afterCropDelete = await prisma.pump.findUniqueOrThrow({ where: { id: pump.id } });
    expect(afterCropDelete.cropId).toBeNull();

    // Deleting the Entity nulls Account.entityId (SetNull); the account survives.
    await prisma.entity.delete({ where: { id: entity.id } });
    const afterEntityDelete = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(afterEntityDelete.entityId).toBeNull();

    // Cleanup: cascade the remaining rows via the farm.
    await prisma.farm.delete({ where: { id: farm.id } });
    expect(await prisma.pump.count()).toBe(0);
    expect(await prisma.account.count()).toBe(0);
  }, 60_000);
});
