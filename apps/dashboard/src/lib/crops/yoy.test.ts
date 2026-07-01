import { describe, expect, it } from "vitest";
import { yearOverYear, yoyRatio } from "./yoy";
import type { WorksheetRow } from "./worksheet";

function row(over: Partial<WorksheetRow> & Pick<WorksheetRow, "blockId" | "blockName" | "variety" | "fieldWeightLb" | "hullerWeightLb">): WorksheetRow {
  return {
    entityName: "CSB",
    cropYear: 2025,
    acres: 80,
    turnoutPct: null,
    yoyFieldWeight: null,
    tgmLbs: null,
    tgmSource: null,
    gradeDeductionRate: null,
    lossLb: null,
    sellablePct: null,
    reconciled: false,
    sourceMismatch: false,
    ...over,
  };
}

describe("yearOverYear", () => {
  const y2024 = [
    row({ blockId: "b1", blockName: "1", variety: "NONPAREIL", fieldWeightLb: 493_000, hullerWeightLb: 90_000, turnoutPct: 0.1826 }),
  ];
  const y2025 = [
    row({ blockId: "b1", blockName: "1", variety: "NONPAREIL", fieldWeightLb: 631_000, hullerWeightLb: 109_000, turnoutPct: 0.1727, tgmLbs: 108_652 }),
    row({ blockId: "b2", blockName: "5", variety: "MONTEREY", fieldWeightLb: 107_640, hullerWeightLb: 19_600, turnoutPct: 0.182 }),
  ];
  const { years, rows, farmByYear } = yearOverYear({
    perYear: new Map([
      [2024, y2024],
      [2025, y2025],
    ]),
  });

  it("orders seasons newest first", () => {
    expect(years).toEqual([2025, 2024]);
  });

  it("pivots to one row per (block, variety) with a cell per season it appears in", () => {
    expect(rows).toHaveLength(2);
    const np = rows.find((r) => r.blockName === "1")!;
    expect(np.byYear[2025]!.fieldWeightLb).toBe(631_000);
    expect(np.byYear[2024]!.fieldWeightLb).toBe(493_000);
    // The Monterey row only exists in 2025 -> no 2024 cell (blank, not a zero).
    const m = rows.find((r) => r.variety === "MONTEREY")!;
    expect(m.byYear[2024]).toBeUndefined();
    expect(m.byYear[2025]!.hullerWeightLb).toBe(19_600);
  });

  it("subtotals each season farm-wide, turnout recomputed from summed weights", () => {
    expect(farmByYear[2025]!.fieldWeightLb).toBe(738_640); // 631,000 + 107,640
    expect(farmByYear[2024]!.fieldWeightLb).toBe(493_000);
  });

  it("yoyRatio gives the season-over-prior change, null when a season lacks the figure", () => {
    const np = rows.find((r) => r.blockName === "1")!;
    // 2025 field weight vs 2024: 631,000 / 493,000
    expect(yoyRatio(np, years, 0, "fieldWeightLb")!).toBeCloseTo(1.28, 2);
    // 2024 is the oldest -> no prior season -> null
    expect(yoyRatio(np, years, 1, "fieldWeightLb")).toBeNull();
    // Monterey has no 2024 cell -> null delta for 2025
    const m = rows.find((r) => r.variety === "MONTEREY")!;
    expect(yoyRatio(m, years, 0, "fieldWeightLb")).toBeNull();
  });
});
