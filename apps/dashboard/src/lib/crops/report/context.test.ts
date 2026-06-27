import { describe, expect, it } from "vitest";
import { buildReportContext } from "./context";
import type { Position, Positions } from "../types";

// A position with distinctive, easy-to-spot figures so the assertions read clearly and any drift in
// a single pound is visible.
function pos(overrides: Partial<Position> & Pick<Position, "cropYear" | "variety">): Position {
  return {
    producedPounds: 0,
    committedPounds: 0,
    poolPounds: 0,
    unsoldPounds: 0,
    estimateToSettledGapPounds: null,
    isSettled: false,
    ...overrides,
  };
}

describe("buildReportContext", () => {
  it("reproduces every per-cell figure to the pound", () => {
    const positions: Positions = [
      pos({
        cropYear: 2026,
        variety: "Nonpareil",
        producedPounds: 240_000,
        committedPounds: 150_000,
        poolPounds: 50_000,
        unsoldPounds: 40_000,
      }),
    ];
    const ctx = buildReportContext(positions);

    expect(ctx.cells).toHaveLength(1);
    expect(ctx.cells[0]).toMatchObject({
      cropYear: 2026,
      variety: "Nonpareil",
      producedPounds: 240_000,
      committedPounds: 150_000,
      poolPounds: 50_000,
      unsoldPounds: 40_000,
      isSettled: false,
      basis: "estimate",
      estimateToSettledGapPounds: null,
    });
    expect(ctx.cells[0]?.formatted).toMatchObject({
      producedPounds: "240,000",
      committedPounds: "150,000",
      poolPounds: "50,000",
      unsoldPounds: "40,000",
      estimateToSettledGapPounds: null,
    });
  });

  it("includes the gap where a settlement moved an estimate, labeled settled", () => {
    const positions: Positions = [
      pos({
        cropYear: 2026,
        variety: "Nonpareil",
        producedPounds: 248_500,
        committedPounds: 100_000,
        poolPounds: 0,
        unsoldPounds: 148_500,
        estimateToSettledGapPounds: 8_500, // 248,500 settled - 240,000 estimate
        isSettled: true,
      }),
    ];
    const ctx = buildReportContext(positions);

    expect(ctx.cells[0]).toMatchObject({
      isSettled: true,
      basis: "settled",
      estimateToSettledGapPounds: 8_500,
    });
    expect(ctx.cells[0]?.formatted.estimateToSettledGapPounds).toBe("+8,500");
    // The verbatim block carries the labeled gap exactly, so the prose can copy it.
    expect(ctx.block).toContain("SETTLED (final)");
    expect(ctx.block).toContain("Settlement gap vs estimate: +8,500 lb");
  });

  it("formats a negative settlement gap with a minus sign", () => {
    const positions: Positions = [
      pos({
        cropYear: 2025,
        variety: "Monterey",
        producedPounds: 98_800,
        unsoldPounds: 98_800,
        estimateToSettledGapPounds: -1_200,
        isSettled: true,
      }),
    ];
    const ctx = buildReportContext(positions);
    expect(ctx.cells[0]?.formatted.estimateToSettledGapPounds).toBe("-1,200");
    expect(ctx.block).toContain("Settlement gap vs estimate: -1,200 lb");
  });

  it("sums totals from the locked per-cell pounds and counts the settled/estimate mix", () => {
    const positions: Positions = [
      pos({
        cropYear: 2026,
        variety: "Monterey",
        producedPounds: 100_000,
        committedPounds: 60_000,
        poolPounds: 10_000,
        unsoldPounds: 30_000,
      }),
      pos({
        cropYear: 2026,
        variety: "Nonpareil",
        producedPounds: 248_500,
        committedPounds: 200_000,
        poolPounds: 0,
        unsoldPounds: 48_500,
        estimateToSettledGapPounds: 8_500,
        isSettled: true,
      }),
    ];
    const ctx = buildReportContext(positions);

    expect(ctx.totals).toMatchObject({
      producedPounds: 348_500, // 100,000 + 248,500
      committedPounds: 260_000, // 60,000 + 200,000
      poolPounds: 10_000,
      unsoldPounds: 78_500, // 30,000 + 48,500
      cellCount: 2,
      settledCellCount: 1,
      estimateCellCount: 1,
    });
    expect(ctx.totals.formatted.producedPounds).toBe("348,500");
    expect(ctx.block).toContain("Cells: 2 (1 settled, 1 estimate)");
  });

  it("orders cells stably by (cropYear asc, variety asc) regardless of input order", () => {
    const positions: Positions = [
      pos({ cropYear: 2026, variety: "Nonpareil", producedPounds: 1 }),
      pos({ cropYear: 2025, variety: "Nonpareil", producedPounds: 2 }),
      pos({ cropYear: 2026, variety: "Monterey", producedPounds: 3 }),
    ];
    const ctx = buildReportContext(positions);
    expect(ctx.cells.map((c) => [c.cropYear, c.variety])).toEqual([
      [2025, "Nonpareil"],
      [2026, "Monterey"],
      [2026, "Nonpareil"],
    ]);
  });

  it("is pure: identical positions yield identical context (byte-stable block)", () => {
    const positions: Positions = [
      pos({ cropYear: 2026, variety: "Nonpareil", producedPounds: 240_000, unsoldPounds: 240_000 }),
    ];
    expect(buildReportContext(positions)).toEqual(buildReportContext(positions));
    expect(buildReportContext(positions).block).toBe(buildReportContext(positions).block);
  });

  it("handles an empty position with a stable empty block and zero totals", () => {
    const ctx = buildReportContext([]);
    expect(ctx.cells).toHaveLength(0);
    expect(ctx.totals).toMatchObject({
      producedPounds: 0,
      cellCount: 0,
      settledCellCount: 0,
      estimateCellCount: 0,
    });
    expect(ctx.block).toContain("No crop positions recorded.");
  });
});
