import { describe, expect, it } from "vitest";
import {
  inventoryFacets,
  inventoryPositions,
  isInventoryStage,
  stageTotals,
  toInventoryWrite,
  type InventoryAdjustment,
  type InventoryWriteRaw,
} from "./inventory";

const adj = (over: Partial<InventoryAdjustment>): InventoryAdjustment => ({
  packer: "Blue Diamond",
  blockId: "b1",
  blockName: "1",
  variety: "NONPAREIL",
  stage: "MEATS",
  netGoodMeatsLbs: 100_000,
  cropYear: 2025,
  ...over,
});

describe("inventoryPositions", () => {
  it("sums signed adjustments into an on-hand position per (packer, block, variety, stage)", () => {
    const pos = inventoryPositions([
      adj({ netGoodMeatsLbs: 100_000 }),
      adj({ netGoodMeatsLbs: -30_000 }), // a removal (sale/shipment)
    ]);
    expect(pos).toHaveLength(1);
    expect(pos[0]!.onHandLbs).toBe(70_000);
  });

  it("drops a position that nets to exactly zero (nothing on hand)", () => {
    const pos = inventoryPositions([adj({ netGoodMeatsLbs: 50_000 }), adj({ netGoodMeatsLbs: -50_000 })]);
    expect(pos).toHaveLength(0);
  });

  it("skips rows outside a known stage", () => {
    const pos = inventoryPositions([adj({ stage: "BOGUS" }), adj({ stage: "RAW" })]);
    expect(pos).toHaveLength(1);
    expect(pos[0]!.stage).toBe("RAW");
  });

  it("filters by packer / variety / stage / cropYear", () => {
    const rows = [
      adj({ packer: "Blue Diamond", variety: "NONPAREIL", stage: "MEATS" }),
      adj({ packer: "Sierra Valley", variety: "MONTEREY", stage: "RAW" }),
    ];
    expect(inventoryPositions(rows, { packer: "Sierra Valley" })).toHaveLength(1);
    expect(inventoryPositions(rows, { variety: "NONPAREIL" })[0]!.packer).toBe("Blue Diamond");
    expect(inventoryPositions(rows, { stage: "RAW" })[0]!.variety).toBe("MONTEREY");
    expect(inventoryPositions(rows, { cropYear: 2024 })).toHaveLength(0);
  });

  it("sorts packer -> block -> variety -> stage", () => {
    const pos = inventoryPositions([
      adj({ packer: "Sierra Valley", blockName: "5", variety: "MONTEREY", stage: "MEATS" }),
      adj({ packer: "Blue Diamond", blockName: "11", variety: "ALDRICH", stage: "RAW" }),
      adj({ packer: "Blue Diamond", blockName: "1", variety: "NONPAREIL", stage: "STOCKPILE" }),
    ]);
    expect(pos.map((p) => p.packer)).toEqual(["Blue Diamond", "Blue Diamond", "Sierra Valley"]);
    // Within Blue Diamond, block 1 before block 11 (numeric-aware).
    expect(pos[0]!.blockName).toBe("1");
    expect(pos[1]!.blockName).toBe("11");
  });
});

describe("stageTotals + facets + isInventoryStage", () => {
  it("totals on-hand pounds by stage", () => {
    const pos = inventoryPositions([
      adj({ stage: "RAW", netGoodMeatsLbs: 200_000 }),
      adj({ stage: "MEATS", netGoodMeatsLbs: 90_000 }),
      adj({ stage: "MEATS", blockName: "5", blockId: "b2", netGoodMeatsLbs: 10_000 }),
    ]);
    const t = stageTotals(pos);
    expect(t.RAW).toBe(200_000);
    expect(t.MEATS).toBe(100_000);
    expect(t.STOCKPILE).toBe(0);
  });

  it("collects distinct packers + varieties, sorted", () => {
    const f = inventoryFacets([
      adj({ packer: "Sierra Valley", variety: "MONTEREY" }),
      adj({ packer: "Blue Diamond", variety: "NONPAREIL" }),
      adj({ packer: "Blue Diamond", variety: "NONPAREIL" }),
    ]);
    expect(f.packers).toEqual(["Blue Diamond", "Sierra Valley"]);
    expect(f.varieties).toEqual(["MONTEREY", "NONPAREIL"]);
  });

  it("validates a stage string", () => {
    expect(isInventoryStage("RAW")).toBe(true);
    expect(isInventoryStage("MEATS")).toBe(true);
    expect(isInventoryStage("nope")).toBe(false);
  });
});

describe("toInventoryWrite", () => {
  const base: InventoryWriteRaw = {
    cropYear: 2025,
    blockId: "b1",
    variety: "np",
    packer: "Blue Diamond",
    stage: "MEATS",
    amountLbs: 40_000,
    direction: "add",
    reason: "counted at yard",
  };

  it("signs an add positive and a remove negative, normalizing the variety", () => {
    expect(toInventoryWrite(base)).toMatchObject({
      variety: "NONPAREIL",
      netGoodMeatsLbs: 40_000,
      source: "MANUAL_ENTRY",
      reason: "counted at yard",
    });
    expect(toInventoryWrite({ ...base, direction: "remove" })!.netGoodMeatsLbs).toBe(-40_000);
  });

  it("nulls a blank packer / block", () => {
    const out = toInventoryWrite({ ...base, packer: "  ", blockId: "" })!;
    expect(out.packer).toBeNull();
    expect(out.blockId).toBeNull();
  });

  it("rejects bad fields rather than writing garbage", () => {
    expect(toInventoryWrite({ ...base, amountLbs: 0 })).toBeNull();
    expect(toInventoryWrite({ ...base, amountLbs: 10.5 })).toBeNull();
    expect(toInventoryWrite({ ...base, stage: "BOGUS" })).toBeNull();
    expect(toInventoryWrite({ ...base, variety: "   " })).toBeNull();
    expect(toInventoryWrite({ ...base, reason: "  " })).toBeNull();
    expect(toInventoryWrite({ ...base, cropYear: 1999 })).toBeNull();
  });
});
