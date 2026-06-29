import { describe, expect, it } from "vitest";
import { allocateByAcreage, blockYields, costPerPound } from "./cost";

describe("allocateByAcreage", () => {
  it("splits proportional to acreage, integer-exact", () => {
    const { allocated, unallocatableCents } = allocateByAcreage(1000, [
      { blockId: "A", acreage: 60 },
      { blockId: "B", acreage: 40 },
    ]);
    expect(unallocatableCents).toBe(0);
    expect(allocated).toEqual([
      { blockId: "A", cents: 600 },
      { blockId: "B", cents: 400 },
    ]);
  });

  it("uses largest-remainder so the parts sum EXACTLY to the input", () => {
    const { allocated } = allocateByAcreage(1000, [
      { blockId: "A", acreage: 1 },
      { blockId: "B", acreage: 1 },
      { blockId: "C", acreage: 1 },
    ]);
    expect(allocated.reduce((s, p) => s + p.cents, 0)).toBe(1000); // no lost cent
    expect(allocated.map((p) => p.cents).sort()).toEqual([333, 333, 334]);
  });

  it("returns the whole amount as unallocatable when total acreage is 0", () => {
    const { allocated, unallocatableCents } = allocateByAcreage(1000, [
      { blockId: "A", acreage: 0 },
      { blockId: "B", acreage: null },
    ]);
    expect(allocated).toEqual([]);
    expect(unallocatableCents).toBe(1000);
  });

  it("sends all cents to a single block", () => {
    expect(allocateByAcreage(777, [{ blockId: "A", acreage: 5 }])).toEqual({
      allocated: [{ blockId: "A", cents: 777 }],
      unallocatableCents: 0,
    });
  });
});

describe("blockYields", () => {
  const map = new Map([
    ["NP-A", "A"],
    ["NP-B", "B"],
  ]);
  it("routes mapped fields to blocks, accumulates unmapped, filters crop year", () => {
    const { byBlock, unmappedLb } = blockYields({
      deliveries: [
        { field: "NP-A", netLb: 120_000, cropYear: 2025 },
        { field: "NP-A", netLb: 80_000, cropYear: 2025 },
        { field: "NP-B", netLb: 100_000, cropYear: 2025 },
        { field: "NP-?", netLb: 30_000, cropYear: 2025 }, // unmapped
        { field: null, netLb: 5_000, cropYear: 2025 }, // no field
        { field: "NP-A", netLb: 999, cropYear: 2024 }, // wrong year, excluded
      ],
      fieldBlockMap: map,
      productionByBlock: [],
      cropYear: 2025,
    });
    expect(byBlock.find((b) => b.blockId === "A")?.netLb).toBe(200_000);
    expect(byBlock.find((b) => b.blockId === "B")?.netLb).toBe(100_000);
    expect(unmappedLb).toBe(35_000); // 30k unmapped field + 5k no-field
  });

  it("ProductionRecord blockId overrides deliveries for that block", () => {
    const { byBlock } = blockYields({
      deliveries: [{ field: "NP-A", netLb: 120_000, cropYear: 2025 }],
      fieldBlockMap: map,
      productionByBlock: [{ blockId: "A", pounds: 250_000 }], // settled override
      cropYear: 2025,
    });
    expect(byBlock.find((b) => b.blockId === "A")?.netLb).toBe(250_000);
  });
});

describe("costPerPound", () => {
  it("computes per-block and farm cents/lb to the cent (worked example)", () => {
    const result = costPerPound({
      cropYear: 2025,
      // M1 serves both A+B; M2 serves only A.
      meterCosts: [
        { meterId: "M1", cents: 11_000_000 },
        { meterId: "M2", cents: 5_000_000 },
      ],
      meterBlockLinks: [
        { meterId: "M1", blockId: "A", acreage: 60 },
        { meterId: "M1", blockId: "B", acreage: 40 },
        { meterId: "M2", blockId: "A", acreage: 60 },
      ],
      blocks: [
        { id: "A", name: "Block A", acreage: 60 },
        { id: "B", name: "Block B", acreage: 40 },
      ],
      yields: {
        byBlock: [
          { blockId: "A", netLb: 200_000 },
          { blockId: "B", netLb: 100_000 },
        ],
        unmappedLb: 30_000,
      },
      coverage: { metersTotal: 2, metersReconciled: 2 },
    });

    const a = result.blocks.find((b) => b.blockId === "A")!;
    const b = result.blocks.find((b) => b.blockId === "B")!;
    // M1: 60/40 -> A 6,600,000, B 4,400,000. M2: +5,000,000 to A.
    expect(a.energyCents).toBe(11_600_000);
    expect(a.centsPerLb).toBe(58); // 11,600,000 / 200,000
    expect(b.energyCents).toBe(4_400_000);
    expect(b.centsPerLb).toBe(44); // 4,400,000 / 100,000

    // Farm: 16,000,000c / (200k + 100k + 30k unmapped) = 48.48 -> 48
    expect(result.farm.energyCents).toBe(16_000_000);
    expect(result.farm.netLb).toBe(330_000);
    expect(result.farm.centsPerLb).toBe(48);

    // Apportionment loses no cent: block energy + unallocatable == total meter cents.
    const blockEnergy = result.blocks.reduce((s, bl) => s + bl.energyCents, 0);
    expect(blockEnergy + result.residual.unallocatableEnergyCents).toBe(16_000_000);
    expect(result.residual.unmappedYieldLb).toBe(30_000);
    expect(result.residual.metersReconciled).toBe(2);
  });

  it("returns null cents/lb for a block with no yield (never divides by zero)", () => {
    const result = costPerPound({
      cropYear: 2025,
      meterCosts: [{ meterId: "M1", cents: 500_000 }],
      meterBlockLinks: [{ meterId: "M1", blockId: "A", acreage: 10 }],
      blocks: [{ id: "A", name: "Block A", acreage: 10 }],
      yields: { byBlock: [{ blockId: "A", netLb: 0 }], unmappedLb: 0 },
      coverage: { metersTotal: 1, metersReconciled: 1 },
    });
    expect(result.blocks.find((b) => b.blockId === "A")?.centsPerLb).toBe(null);
  });
});
