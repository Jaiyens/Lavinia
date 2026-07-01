// Track E pure tool-core tests: the position-card / packer-table / yoy-chart tools must return data
// that matches recomputePositions / the Track D views to the POUND (the gate's central law), and an
// empty ledger must produce the typed empty result (never a blank, never a fabricated number). These
// test the PURE tool cores (positionCardResult / packerTableResult / yoyChartResult) over fixture
// ledgers — no DB, no model, no live call.

import { describe, expect, it } from "vitest";
import { recomputePositions } from "@/lib/crops/positions";
import { cropYearBars, cropYearSummary, packerRows } from "@/lib/crops/views";
import type {
  CommitmentEntry,
  CropLedger,
  PoolEntry,
  ProductionEntry,
} from "@/lib/crops/types";
import { positionCardResult } from "./position-card";
import { packerTableResult } from "./packer-table";
import { yoyChartResult } from "./yoy-chart";

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
function commit(
  id: string,
  cropYear: number,
  variety: string,
  pounds: number,
  buyer = "Packer Co",
): CommitmentEntry {
  return {
    id,
    cropYear,
    variety,
    pounds,
    buyer,
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

const FIXTURE: CropLedger = {
  production: [
    prod("p1", 2025, "Nonpareil", 180_000),
    prod("p2", 2026, "Nonpareil", 240_000),
    prod("p3", 2026, "Monterey", 100_000),
  ],
  commitments: [
    commit("c1", 2026, "Nonpareil", 150_000, "Blue Diamond"),
    commit("c2", 2026, "Nonpareil", 30_000, "RPAC"),
    commit("c3", 2026, "Monterey", 40_000, "RPAC"),
    commit("c4", 2025, "Nonpareil", 90_000, "RPAC"),
  ],
  pools: [pool("o1", 2026, "Nonpareil", 20_000)],
};

const EMPTY: CropLedger = { production: [], commitments: [], pools: [] };

describe("positionCardResult", () => {
  it("returns the crop-year position matching cropYearSummary to the pound", () => {
    const result = positionCardResult(FIXTURE, { cropYear: 2026 });
    expect(result.kind).toBe("position");
    if (result.kind !== "position") throw new Error("expected position");

    const expected = cropYearSummary(recomputePositions(FIXTURE), 2026);
    expect(expected).not.toBeNull();
    expect(result.summary).toEqual({
      producedPounds: expected?.producedPounds,
      committedPounds: expected?.committedPounds,
      poolPounds: expected?.poolPounds,
      unsoldPounds: expected?.unsoldPounds,
      allSettled: expected?.allSettled,
      gapPounds: expected?.gapPounds,
    });
    // Spot-check the actual pounds: 2026 produced = 240k + 100k = 340k; unsold = 340k - 220k - 20k.
    expect(result.summary.producedPounds).toBe(340_000);
    expect(result.summary.committedPounds).toBe(220_000);
    expect(result.summary.poolPounds).toBe(20_000);
    expect(result.summary.unsoldPounds).toBe(100_000);
    // Per-variety cells preserved (sorted: Monterey then Nonpareil).
    expect(result.cells.map((c) => c.variety)).toEqual(["Monterey", "Nonpareil"]);
  });

  it("defaults to the latest crop year when none is given", () => {
    const result = positionCardResult(FIXTURE, {});
    expect(result.kind).toBe("position");
    if (result.kind !== "position") throw new Error("expected position");
    expect(result.cropYear).toBe(2026);
  });

  it("carries the settlement gap and settled flag from the position", () => {
    const ledger: CropLedger = {
      production: [
        prod("e1", 2026, "Nonpareil", 240_000, "ALMOND_LOGIC"),
        prod("s1", 2026, "Nonpareil", 248_500, "PACKER_SETTLED", "e1"),
      ],
      commitments: [],
      pools: [],
    };
    const result = positionCardResult(ledger, { cropYear: 2026 });
    if (result.kind !== "position") throw new Error("expected position");
    expect(result.summary.allSettled).toBe(true);
    expect(result.summary.gapPounds).toBe(8_500);
    expect(result.summary.producedPounds).toBe(248_500);
  });

  it("returns the typed empty result over an empty ledger", () => {
    expect(positionCardResult(EMPTY, {})).toEqual({
      kind: "empty",
      reason: "No crop records for this farm yet.",
    });
  });

  it("returns the typed empty result for a year with no cells", () => {
    const result = positionCardResult(FIXTURE, { cropYear: 1999 });
    expect(result.kind).toBe("empty");
    if (result.kind !== "empty") throw new Error("expected empty");
    expect(result.reason).toContain("1999");
  });
});

describe("packerTableResult", () => {
  it("returns packerRows verbatim (all years) matching the view to the pound", () => {
    const result = packerTableResult(FIXTURE, {});
    expect(result.kind).toBe("packerTable");
    if (result.kind !== "packerTable") throw new Error("expected packerTable");

    const expected = packerRows(FIXTURE, recomputePositions(FIXTURE));
    expect(result.rows).toEqual(expected);
    expect(result.cropYear).toBeNull();
  });

  it("filters to a single crop year by row selection (no arithmetic)", () => {
    const result = packerTableResult(FIXTURE, { cropYear: 2026 });
    if (result.kind !== "packerTable") throw new Error("expected packerTable");
    expect(result.cropYear).toBe(2026);
    expect(result.rows.every((r) => r.cropYear === 2026)).toBe(true);
    const expected = packerRows(FIXTURE, recomputePositions(FIXTURE)).filter((r) => r.cropYear === 2026);
    expect(result.rows).toEqual(expected);
  });

  it("returns the typed empty result over an empty ledger", () => {
    expect(packerTableResult(EMPTY, {})).toEqual({
      kind: "empty",
      reason: "No packer commitments recorded for this farm yet.",
    });
  });

  it("returns the typed empty result for a year with no commitments", () => {
    const result = packerTableResult(FIXTURE, { cropYear: 1999 });
    expect(result.kind).toBe("empty");
    if (result.kind !== "empty") throw new Error("expected empty");
    expect(result.reason).toContain("1999");
  });
});

describe("yoyChartResult", () => {
  it("returns cropYearBars verbatim matching the view to the pound", () => {
    const result = yoyChartResult(FIXTURE);
    expect(result.kind).toBe("yoyChart");
    if (result.kind !== "yoyChart") throw new Error("expected yoyChart");
    expect(result.bars).toEqual(cropYearBars(recomputePositions(FIXTURE)));
    // Two seasons present, ascending.
    expect(result.bars.map((b) => b.cropYear)).toEqual([2025, 2026]);
  });

  it("returns the typed empty result over an empty ledger", () => {
    expect(yoyChartResult(EMPTY)).toEqual({
      kind: "empty",
      reason: "No seasons to compare for this farm yet.",
    });
  });
});
