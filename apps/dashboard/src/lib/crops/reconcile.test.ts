import { describe, expect, it } from "vitest";
import { reconciliationRows, RECONCILE_GAP_FLAG_PCT } from "./views";
import type { Position } from "./types";
import type { VarietyWeight } from "./deliveries";

// Pure tests for the POUND-GATE (WS2b): per (cropYear, variety), field weight vs settled weight and
// the gap between them. gapPct is the settlement movement as a percent of the estimate it superseded
// (estimate = settled - gap), so a 1,200,000 estimate settling to 1,080,000 reads as -10.0% and is
// flagged. Every figure is integer-safe; the gap sign is honest, never clamped.

function pos(extra: Partial<Position> & Pick<Position, "cropYear" | "variety">): Position {
  return {
    producedPounds: 0,
    committedPounds: 0,
    poolPounds: 0,
    unsoldPounds: 0,
    estimateToSettledGapPounds: null,
    isSettled: false,
    ...extra,
  };
}

describe("reconciliationRows pound-gate", () => {
  it("estimate 1,200,000 -> settled 1,080,000 gives gapPct -10 and is flagged", () => {
    // The settlement moved the estimate down by 120,000 (gap = settled - estimate = -120,000), so
    // estimate = settled - gap = 1,080,000 - (-120,000) = 1,200,000; -120,000 / 1,200,000 = -10.0%.
    const positions: Position[] = [
      pos({
        cropYear: 2026,
        variety: "Nonpareil",
        producedPounds: 1_080_000,
        estimateToSettledGapPounds: -120_000,
        isSettled: true,
      }),
    ];
    const deliveries: VarietyWeight[] = [{ variety: "Nonpareil", pounds: 1_200_000 }];

    const rows = reconciliationRows(positions, deliveries);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.cropYear).toBe(2026);
    expect(row.variety).toBe("Nonpareil");
    expect(row.fieldPounds).toBe(1_200_000); // the field/delivery weight
    expect(row.settledPounds).toBe(1_080_000);
    expect(row.gapPounds).toBe(-120_000);
    expect(row.gapPct).toBe(-10);
    expect(row.flagged).toBe(true);
    expect(Math.abs(row.gapPct!)).toBeGreaterThanOrEqual(RECONCILE_GAP_FLAG_PCT);
  });

  it("a small gap (under the flag band) is not flagged", () => {
    // estimate 1,000,000 -> settled 980,000: gap -20,000, -20,000 / 1,000,000 = -2.0%.
    const positions: Position[] = [
      pos({
        cropYear: 2026,
        variety: "Monterey",
        producedPounds: 980_000,
        estimateToSettledGapPounds: -20_000,
        isSettled: true,
      }),
    ];
    const rows = reconciliationRows(positions, [{ variety: "Monterey", pounds: 1_000_000 }]);
    expect(rows[0]!.gapPct).toBe(-2);
    expect(rows[0]!.flagged).toBe(false);
  });

  it("no settlement yet leaves settled/gap/gapPct null (an estimate is never read as a final)", () => {
    const positions: Position[] = [
      pos({ cropYear: 2026, variety: "Aldrich", producedPounds: 120_000, isSettled: false }),
    ];
    const rows = reconciliationRows(positions, [{ variety: "Aldrich", pounds: 130_000 }]);
    const row = rows[0]!;
    expect(row.settledPounds).toBeNull();
    expect(row.gapPounds).toBeNull();
    expect(row.gapPct).toBeNull();
    expect(row.flagged).toBe(false);
    expect(row.fieldPounds).toBe(130_000);
  });

  it("rolls field weight onto the variety's latest position year, counted once", () => {
    const positions: Position[] = [
      pos({ cropYear: 2025, variety: "Nonpareil", producedPounds: 900_000, isSettled: true, estimateToSettledGapPounds: 0 }),
      pos({ cropYear: 2026, variety: "Nonpareil", producedPounds: 1_000_000, isSettled: true, estimateToSettledGapPounds: 0 }),
    ];
    const rows = reconciliationRows(positions, [{ variety: "Nonpareil", pounds: 1_111_111 }]);
    const y2026 = rows.find((r) => r.cropYear === 2026)!;
    const y2025 = rows.find((r) => r.cropYear === 2025)!;
    // The field roll lands on the latest year (2026) once, not double-counted across both seasons.
    expect(y2026.fieldPounds).toBe(1_111_111);
    expect(y2025.fieldPounds).toBe(0);
  });

  it("sorts by crop year desc then variety asc", () => {
    const positions: Position[] = [
      pos({ cropYear: 2025, variety: "Monterey" }),
      pos({ cropYear: 2026, variety: "Nonpareil" }),
      pos({ cropYear: 2026, variety: "Aldrich" }),
    ];
    const rows = reconciliationRows(positions, []);
    expect(rows.map((r) => `${r.cropYear}:${r.variety}`)).toEqual([
      "2026:Aldrich",
      "2026:Nonpareil",
      "2025:Monterey",
    ]);
  });
});
