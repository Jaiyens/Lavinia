import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  type ConfirmationPayload,
  type ConnectResult,
  connectManual,
  connectSampleFeed,
  currentFarm,
  parseConfirmationPayload,
  saveConfirmation,
} from "./farm";

// Integration test: drive onboarding through Prisma against a throwaway Postgres database
// on the local test cluster (no network, never touches the dev/prod db). Same harness
// as src/lib/greenbutton/import.db.test.ts.

let db: TestDb;
let prisma: PrismaClient;
let connect: ConnectResult;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
  connect = await connectSampleFeed(prisma);
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("connectSampleFeed, fresh farm from the sample feed", () => {
  it("creates a fresh farm with a pending PG&E connection", async () => {
    const farm = await prisma.farm.findUniqueOrThrow({
      where: { id: connect.farmId },
      include: { connections: true },
    });
    expect(farm.name).toBe("My Farm");
    expect(farm.connections).toHaveLength(1);
    expect(farm.connections[0]?.type).toBe("pge_smd");
    expect(farm.connections[0]?.status).toBe("pending");
  });

  it("imports the four meters and classifies three pumps + one non-pump", () => {
    expect(connect.pumps).toBe(4);
    expect(connect.pumpsClassified).toBe(3);
    expect(connect.nonPumpsClassified).toBe(1);
  });

  it("classifies the small flat shop meter as a non-pump", async () => {
    const shop = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: connect.farmId, serviceId: "7720450004" } },
    });
    expect(shop.kind).toBe("non_pump");
    const well = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: connect.farmId, serviceId: "7720450001" } },
    });
    expect(well.kind).toBe("pump");
  });

  it("pre-places a map pin on every imported meter from its address", async () => {
    const pumps = await prisma.pump.findMany({ where: { farmId: connect.farmId } });
    expect(pumps).toHaveLength(4);
    for (const p of pumps) {
      expect(p.latitude).not.toBeNull();
      expect(p.longitude).not.toBeNull();
    }
  });

  it("is not yet the current farm (connection still pending)", async () => {
    expect(await currentFarm(prisma)).toBeNull();
  });
});

describe("saveConfirmation, persisting the farmer's edits", () => {
  it("renames pumps, creates fields + crops, retags, adds a diesel pump, and activates", async () => {
    const homeWell = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: connect.farmId, serviceId: "7720450001" } },
    });
    const shop = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: connect.farmId, serviceId: "7720450004" } },
    });

    const payload: ConfirmationPayload = {
      farmId: connect.farmId,
      farmName: "Olsen Family Farms",
      blocks: [
        { tempId: "b1", name: "Home Pistachios", acreage: 120, cropName: "Pistachio" },
      ],
      pumps: [
        {
          id: homeWell.id,
          name: "Home Well",
          kind: "pump",
          blockTempIds: ["b1"],
          latitude: 36.9,
          longitude: -120.1,
        },
        // The shop: confirm it as a non-pump, no fields.
        { id: shop.id, name: "Shop", kind: "non_pump", blockTempIds: [], latitude: null, longitude: null },
      ],
      newPumps: [
        {
          name: "River Diesel",
          powerSource: "diesel",
          horsepower: 90,
          blockTempIds: ["b1"],
          latitude: 36.8,
          longitude: -120.2,
        },
      ],
    };

    const result = await saveConfirmation(prisma, payload);
    expect(result.blocksCreated).toBe(1);
    expect(result.pumpsUpdated).toBe(2);
    expect(result.pumpsCreated).toBe(1);

    // Farm renamed.
    const farm = await prisma.farm.findUniqueOrThrow({ where: { id: connect.farmId } });
    expect(farm.name).toBe("Olsen Family Farms");

    // Crop created (shared, by unique name) and block wired to it.
    const block = await prisma.block.findFirstOrThrow({
      where: { farmId: connect.farmId },
      include: { crop: true, pumps: true },
    });
    expect(block.name).toBe("Home Pistachios");
    expect(block.acreage).toBe(120);
    expect(block.crop?.name).toBe("Pistachio");

    // Home Well renamed, set to the dragged coords, and serving the block.
    const updated = await prisma.pump.findUniqueOrThrow({
      where: { id: homeWell.id },
      include: { blocks: true },
    });
    expect(updated.name).toBe("Home Well");
    expect(updated.latitude).toBe(36.9);
    expect(updated.blocks.map((b) => b.id)).toEqual([block.id]);

    // The hand-entered diesel pump exists with no service ID.
    const diesel = await prisma.pump.findFirstOrThrow({
      where: { farmId: connect.farmId, powerSource: "diesel" },
      include: { blocks: true },
    });
    expect(diesel.name).toBe("River Diesel");
    expect(diesel.serviceId).toBeNull();
    expect(diesel.horsepower).toBe(90);
    expect(diesel.blocks).toHaveLength(1);

    // Onboarding done: the connection is active and the farm is now current.
    const conn = await prisma.connection.findFirstOrThrow({
      where: { farmId: connect.farmId, type: "pge_smd" },
    });
    expect(conn.status).toBe("active");
    expect(conn.authorizedAt).not.toBeNull();

    // currentFarm is owner-scoped (C2): the activated farm resolves for its owner only.
    // Onboarding sets Farm.userId at identify; mirror that here, then resolve as the owner.
    const owner = await prisma.user.create({ data: { email: "olsen@example.com" } });
    await prisma.farm.update({ where: { id: connect.farmId }, data: { userId: owner.id } });
    const current = await currentFarm(prisma, owner.id);
    expect(current?.id).toBe(connect.farmId);
    // And it stays hidden from a different signed-in user.
    const stranger = await prisma.user.create({ data: { email: "stranger@example.com" } });
    expect(await currentFarm(prisma, stranger.id)).toBeNull();
  });

  it("creates rows on the first save and no-ops an identical re-submit (idempotent body)", async () => {
    // Fresh pending farm so we exercise the create path, then replay the SAME payload
    // (what a back button / double-submit sends) and prove nothing duplicates.
    const res = await connectManual(prisma, {
      farmName: "Replay Farm",
      pump: { name: "Well X", serviceId: "9990003333" },
    });
    const well = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: res.farmId, serviceId: "9990003333" } },
    });
    const payload: ConfirmationPayload = {
      farmId: res.farmId,
      blocks: [{ tempId: "rb1", name: "Replay Block", acreage: 10, cropName: "Pistachio" }],
      pumps: [
        { id: well.id, name: "Well X", kind: "pump", blockTempIds: ["rb1"], latitude: null, longitude: null },
      ],
      newPumps: [
        { name: "Replay Diesel", powerSource: "diesel", horsepower: 50, blockTempIds: ["rb1"], latitude: 36.8, longitude: -120.1 },
      ],
    };

    const first = await saveConfirmation(prisma, payload);
    expect(first.alreadyFinalized).toBeUndefined();
    expect(first.blocksCreated).toBe(1);
    expect(await prisma.block.count({ where: { farmId: res.farmId } })).toBe(1);
    expect(await prisma.pump.count({ where: { farmId: res.farmId } })).toBe(2); // well + diesel

    const second = await saveConfirmation(prisma, payload);
    expect(second.alreadyFinalized).toBe(true);
    expect(await prisma.block.count({ where: { farmId: res.farmId } })).toBe(1);
    expect(await prisma.pump.count({ where: { farmId: res.farmId } })).toBe(2);
  });
});

describe("connectManual, single hand-entered pump", () => {
  it("creates its own farm with one electric pump and a pin from the address", async () => {
    const res = await connectManual(prisma, {
      farmName: "Manual Farm",
      pump: {
        name: "Back 40 Well",
        serviceId: "9990001111",
        rateSchedule: "AG-B",
        billingSerial: "MR-07",
        location: "100 Road 9, Madera, CA",
      },
    });
    expect(res.pumps).toBe(1);
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: res.farmId, serviceId: "9990001111" } },
    });
    expect(pump.name).toBe("Back 40 Well");
    expect(pump.powerSource).toBe("electric");
    expect(pump.latitude).not.toBeNull();
  });
});

describe("parseConfirmationPayload", () => {
  it("normalizes union fields and coerces optional numbers", () => {
    const parsed = parseConfirmationPayload({
      farmId: "f1",
      blocks: [{ tempId: "b1", name: "North", acreage: "55", cropName: "  " }],
      pumps: [{ id: "p1", name: "Well", kind: "weird", blockTempIds: ["b1", 7] }],
      newPumps: [{ name: "Gas Pump", powerSource: "gas" }],
    });
    expect(parsed.blocks[0]?.acreage).toBe(55);
    expect(parsed.blocks[0]?.cropName).toBeNull();
    expect(parsed.pumps[0]?.kind).toBe("pump"); // unknown -> pump
    expect(parsed.pumps[0]?.blockTempIds).toEqual(["b1"]); // non-strings dropped
    expect(parsed.newPumps[0]?.powerSource).toBe("gas");
  });

  it("trims required strings", () => {
    const parsed = parseConfirmationPayload({
      farmId: "  f1  ",
      blocks: [{ tempId: " b1 ", name: "  North  " }],
      pumps: [],
      newPumps: [],
    });
    expect(parsed.farmId).toBe("f1");
    expect(parsed.blocks[0]?.tempId).toBe("b1");
    expect(parsed.blocks[0]?.name).toBe("North");
  });

  it("throws on a missing farmId", () => {
    expect(() => parseConfirmationPayload({ blocks: [], pumps: [], newPumps: [] })).toThrow();
  });
});

describe("crop catalog stays shared across farms despite casing", () => {
  it("folds different cases of a crop name onto one global Crop row", async () => {
    // The first farm already created crop "Pistachio". A second farm entering
    // "pistachio" (lowercase) must reuse that row, not fragment the catalog.
    const res = await connectManual(prisma, {
      farmName: "Casing Farm",
      pump: { name: "Well A", serviceId: "9990002222" },
    });
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { farmId_serviceId: { farmId: res.farmId, serviceId: "9990002222" } },
    });
    await saveConfirmation(prisma, {
      farmId: res.farmId,
      blocks: [{ tempId: "c1", name: "Lower Block", acreage: null, cropName: "pistachio" }],
      pumps: [{ id: pump.id, name: "Well A", kind: "pump", blockTempIds: ["c1"], latitude: null, longitude: null }],
      newPumps: [],
    });

    expect(await prisma.crop.count({ where: { name: "Pistachio" } })).toBe(1);
    expect(await prisma.crop.count({ where: { name: "pistachio" } })).toBe(0);
    const block = await prisma.block.findFirstOrThrow({
      where: { farmId: res.farmId },
      include: { crop: true },
    });
    expect(block.crop?.name).toBe("Pistachio");
  });
});
