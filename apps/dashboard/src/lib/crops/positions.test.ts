import { describe, expect, it } from "vitest";
import { recomputePositions } from "./positions";
import type {
  CommitmentEntry,
  CropLedger,
  PoolEntry,
  Position,
  ProductionEntry,
} from "./types";

function prod(
  id: string,
  cropYear: number,
  variety: string,
  pounds: number,
  source: ProductionEntry["source"] = "ALMOND_LOGIC",
  supersedesId: string | null = null,
): ProductionEntry {
  return { id, cropYear, variety, pounds, source, supersedesId };
}
function commit(id: string, cropYear: number, variety: string, pounds: number): CommitmentEntry {
  return {
    id,
    cropYear,
    variety,
    pounds,
    buyer: "Packer Co",
    source: "ALMOND_LOGIC",
    supersedesId: null,
    status: "committed",
    priceCentsPerPound: null,
    settledPriceCentsPerPound: null,
    collectedCents: null,
    collectedAt: null,
  };
}
function pool(id: string, cropYear: number, variety: string, pounds: number): PoolEntry {
  return { id, cropYear, variety, pounds, pool: "Blue Diamond", source: "ALMOND_LOGIC", supersedesId: null };
}

function find(positions: readonly Position[], cropYear: number, variety: string): Position {
  const pos = positions.find((p) => p.cropYear === cropYear && p.variety === variety);
  if (!pos) throw new Error(`no position for ${cropYear} ${variety}`);
  return pos;
}

describe("recomputePositions", () => {
  it("computes produced/committed/pool/unsold to the pound (estimate-only year)", () => {
    const ledger: CropLedger = {
      production: [prod("p1", 2026, "Nonpareil", 240_000)],
      commitments: [commit("c1", 2026, "Nonpareil", 150_000)],
      pools: [pool("o1", 2026, "Nonpareil", 50_000)],
    };
    expect(find(recomputePositions(ledger), 2026, "Nonpareil")).toMatchObject({
      producedPounds: 240_000,
      committedPounds: 150_000,
      poolPounds: 50_000,
      unsoldPounds: 40_000, // 240k - 150k - 50k
      isSettled: false,
      estimateToSettledGapPounds: null,
    });
  });

  it("keeps each (cropYear, variety) cell independent and sorts the output stably", () => {
    const ledger: CropLedger = {
      production: [
        prod("p1", 2026, "Monterey", 100_000),
        prod("p2", 2026, "Nonpareil", 200_000),
        prod("p3", 2025, "Nonpareil", 80_000),
      ],
      commitments: [],
      pools: [],
    };
    const positions = recomputePositions(ledger);
    expect(positions.map((p) => [p.cropYear, p.variety])).toEqual([
      [2025, "Nonpareil"],
      [2026, "Monterey"],
      [2026, "Nonpareil"],
    ]);
    expect(find(positions, 2026, "Nonpareil").unsoldPounds).toBe(200_000);
  });

  it("surfaces oversold as a negative unsold, never clamped", () => {
    const ledger: CropLedger = {
      production: [prod("p1", 2026, "Nonpareil", 100_000)],
      commitments: [commit("c1", 2026, "Nonpareil", 90_000)],
      pools: [pool("o1", 2026, "Nonpareil", 30_000)],
    };
    expect(find(recomputePositions(ledger), 2026, "Nonpareil").unsoldPounds).toBe(-20_000);
  });

  it("supersede flips a row estimate -> settled: settled wins, gap = delta, input untouched", () => {
    const estimate = prod("p1", 2026, "Nonpareil", 240_000, "ALMOND_LOGIC");
    const settlement = prod("p2", 2026, "Nonpareil", 248_500, "PACKER_SETTLED", "p1");
    const ledger: CropLedger = { production: [estimate, settlement], commitments: [], pools: [] };
    const before = JSON.stringify(ledger);

    expect(find(recomputePositions(ledger), 2026, "Nonpareil")).toMatchObject({
      producedPounds: 248_500, // settled wins; estimate excluded from the live total
      isSettled: true,
      estimateToSettledGapPounds: 8_500, // 248,500 - 240,000
    });

    // Append-only: the estimate row is still physically present in the input (not mutated/removed).
    expect(ledger.production).toContain(estimate);
    expect(JSON.stringify(ledger)).toBe(before);
  });

  it("is pure: identical input yields identical output", () => {
    const ledger: CropLedger = {
      production: [prod("p1", 2026, "Nonpareil", 240_000)],
      commitments: [commit("c1", 2026, "Nonpareil", 100_000)],
      pools: [],
    };
    expect(recomputePositions(ledger)).toEqual(recomputePositions(ledger));
  });
});
