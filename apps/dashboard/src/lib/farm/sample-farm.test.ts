import { describe, expect, it } from "vitest";
import { loadSampleFarm } from "../../../prisma/sample-farm";

// Pure checks on the seed input: loadSampleFarm() throws on any broken relation,
// and these assert the fixture is the farm CLAUDE.md describes. No db here; the
// round-trip-through-Prisma proof lives in seed.db.test.ts.
describe("sample farm fixture", () => {
  const farm = loadSampleFarm();

  it("loads with every relation resolving", () => {
    // loadSampleFarm validates referential integrity and would have thrown.
    expect(farm.farm.name).toBeTruthy();
  });

  it("models a Central Valley pistachio and almond operation", () => {
    expect([...farm.crops.map((c) => c.name)].sort()).toEqual([
      "Almond",
      "Pistachio",
    ]);
    for (const crop of farm.crops) {
      expect(crop.cropCoefficient).toBeGreaterThan(0);
    }
  });

  it("has about six pumps on a mix of AG-B and AG-C", () => {
    expect(farm.pumps.length).toBeGreaterThanOrEqual(6);
    const schedules = new Set(farm.pumps.map((p) => p.rateSchedule));
    expect(schedules.has("AG-B")).toBe(true);
    expect(schedules.has("AG-C")).toBe(true);
    for (const pump of farm.pumps) {
      expect(["AG-B", "AG-C"]).toContain(pump.rateSchedule);
    }
  });

  it("wires every block to a known crop", () => {
    const cropSlugs = new Set(farm.crops.map((c) => c.slug));
    for (const block of farm.blocks) {
      expect(cropSlugs.has(block.crop)).toBe(true);
    }
  });

  it("wires every pump to at least one known block", () => {
    const blockSlugs = new Set(farm.blocks.map((b) => b.slug));
    for (const pump of farm.pumps) {
      expect(pump.blocks.length).toBeGreaterThan(0);
      for (const slug of pump.blocks) {
        expect(blockSlugs.has(slug)).toBe(true);
      }
    }
  });

  it("has at least one pump serving multiple blocks (m-n holds)", () => {
    expect(farm.pumps.some((p) => p.blocks.length > 1)).toBe(true);
  });

  it("has one owner and a PG&E Share My Data connection", () => {
    expect(farm.owner.role).toBe("owner");
    expect(farm.connection.type).toBe("pge_smd");
  });
});
