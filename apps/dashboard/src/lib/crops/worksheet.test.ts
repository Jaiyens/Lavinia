import { describe, expect, it } from "vitest";
import { groupByEntity, subtotal, worksheetRows, type WorksheetInput } from "./worksheet";

// Block 1, CSB, Nonpareil — the golden fixture (FW 631,000 / HW 109,000 / TO ~17.3% / TGM 108,652),
// plus an unmapped delivery (field 99) that must fall to the residual.
const INPUT: WorksheetInput = {
  cropYear: 2025,
  deliveries: [
    { field: "1", variety: "Nonpareil", netLb: 400_000 },
    { field: "1", variety: "Nonpareil", netLb: 231_000 },
    { field: "99", variety: "Nonpareil", netLb: 5_000 }, // unmapped -> residual
  ],
  priorDeliveries: [{ field: "1", variety: "Nonpareil", netLb: 493_000 }],
  runs: [
    { field: "1", variety: "NONPAREIL", binWeight: 60_000, loadWeight: 350_000 },
    { field: "1", variety: "NONPAREIL", binWeight: 49_000, loadWeight: 281_000 },
  ],
  fieldBlockMap: new Map([["1", "b1"]]),
  blocks: [{ id: "b1", name: "1", entityName: "CSB" }],
  plantings: [{ blockId: "b1", variety: "NONPAREIL", acres: 80 }],
  tgm: [
    {
      blockId: "b1",
      variety: "NONPAREIL",
      tgmLbs: 108_652,
      gradeDeductionRate: 0.03,
      source: "MANUAL_ENTRY",
      coverageState: "reconciled",
    },
  ],
};

describe("worksheetRows — Gagan's worksheet computation", () => {
  const { rows, unmappedFieldWeightLb } = worksheetRows(INPUT);

  it("produces one Entity->Block->Variety row with summed weights", () => {
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r).toMatchObject({
      entityName: "CSB",
      blockName: "1",
      variety: "NONPAREIL",
      acres: 80,
      fieldWeightLb: 631_000,
      hullerWeightLb: 109_000,
      tgmLbs: 108_652,
      reconciled: true,
      sourceMismatch: false,
    });
  });

  it("computes turnout / yoy / loss / sellable via the tested calc engine", () => {
    const r = rows[0]!;
    expect(r.turnoutPct!).toBeCloseTo(0.1727, 4); // 109,000 / 631,000
    expect(r.yoyFieldWeight!).toBeCloseTo(1.28, 2); // 631,000 / 493,000
    expect(r.lossLb).toBe(348); // 109,000 - 108,652
    expect(r.sellablePct!).toBeCloseTo(0.9968, 4); // 108,652 / 109,000
  });

  it("routes unmapped delivery net to the residual, not a block", () => {
    expect(unmappedFieldWeightLb).toBe(5_000);
  });
});

describe("needs_review TGM is never treated as settled", () => {
  it("flags an uncertified statement figure distinctly (not reconciled, not a plain pending row)", () => {
    const { rows } = worksheetRows({
      ...INPUT,
      tgm: [
        {
          blockId: "b1",
          variety: "NONPAREIL",
          tgmLbs: 108_652,
          gradeDeductionRate: 0.03,
          source: "BLUE_DIAMOND_STATEMENT",
          coverageState: "needs_review", // the pound-gate could not certify it
        },
      ],
    });
    const r = rows[0]!;
    expect(r.reconciled).toBe(false); // never reads as settled
    expect(r.tgmNeedsReview).toBe(true); // but distinct from an Almond-Logic-only row
    expect(r.tgmLbs).toBe(108_652); // the figure is still shown (flagged), not dropped
  });

  it("a row with no TGM at all is neither reconciled nor needs-review", () => {
    const { rows } = worksheetRows({ ...INPUT, tgm: [] });
    const r = rows[0]!;
    expect(r.reconciled).toBe(false);
    expect(r.tgmNeedsReview).toBe(false);
    expect(r.tgmLbs).toBeNull();
  });
});

describe("acreage is deterministic when duplicate plantings exist", () => {
  it("prefers the exact crop-year planting over a year-agnostic template, regardless of order", () => {
    const base = {
      ...INPUT,
      plantings: [
        { blockId: "b1", variety: "NONPAREIL", acres: 75, cropYear: null }, // template
        { blockId: "b1", variety: "NONPAREIL", acres: 80, cropYear: 2025 }, // exact year -> wins
      ],
    };
    expect(worksheetRows(base).rows[0]!.acres).toBe(80);
    // Reversed input order must give the same answer (no last-write-wins nondeterminism).
    expect(worksheetRows({ ...base, plantings: [...base.plantings].reverse() }).rows[0]!.acres).toBe(80);
  });
});

describe("source cross-check + subtotal", () => {
  it("flags a (block,variety) whose delivery net and run load weight disagree > 2%", () => {
    const { rows } = worksheetRows({
      ...INPUT,
      // runs claim only 400k delivered vs 631k of delivery net -> contradiction
      runs: [{ field: "1", variety: "NONPAREIL", binWeight: 100_000, loadWeight: 400_000 }],
    });
    expect(rows[0]!.sourceMismatch).toBe(true);
  });

  it("groups sorted rows by entity, each group carrying its own subtotal", () => {
    const rows = [
      { entityName: "CSB", blockId: "b1", blockName: "1", variety: "NONPAREIL", cropYear: 2025, acres: 80, fieldWeightLb: 600_000, hullerWeightLb: 100_000, turnoutPct: 0.1667, yoyFieldWeight: null, tgmLbs: 99_000, tgmSource: "MANUAL_ENTRY", gradeDeductionRate: 0.03, lossLb: 1_000, sellablePct: 0.99, reconciled: true, tgmNeedsReview: false, sourceMismatch: false },
      { entityName: "CSB", blockId: "b2", blockName: "5", variety: "MONTEREY", cropYear: 2025, acres: 40, fieldWeightLb: 400_000, hullerWeightLb: 100_000, turnoutPct: 0.25, yoyFieldWeight: null, tgmLbs: null, tgmSource: null, gradeDeductionRate: null, lossLb: null, sellablePct: null, reconciled: false, tgmNeedsReview: false, sourceMismatch: false },
      { entityName: "FLP", blockId: "b3", blockName: "6", variety: "NONPAREIL", cropYear: 2025, acres: 80, fieldWeightLb: 500_000, hullerWeightLb: 80_000, turnoutPct: 0.16, yoyFieldWeight: null, tgmLbs: 79_000, tgmSource: "MANUAL_ENTRY", gradeDeductionRate: 0.03, lossLb: 1_000, sellablePct: 0.9875, reconciled: true, tgmNeedsReview: false, sourceMismatch: false },
    ] as const;
    const groups = groupByEntity(rows);
    expect(groups.map((g) => g.entityName)).toEqual(["CSB", "FLP"]);
    expect(groups[0]!.rows).toHaveLength(2);
    expect(groups[0]!.subtotal.fieldWeightLb).toBe(1_000_000);
    expect(groups[0]!.subtotal.turnoutPct!).toBeCloseTo(0.2, 4); // 200k / 1,000k, recomputed
    expect(groups[0]!.subtotal.tgmLbs).toBe(99_000); // only the reconciled row has TGM
    expect(groups[1]!.rows).toHaveLength(1);
    expect(groups[1]!.subtotal.fieldWeightLb).toBe(500_000);
  });

  it("recomputes subtotal turnout from summed weights (never averaged)", () => {
    const st = subtotal([
      { ...worksheetRows(INPUT).rows[0]! },
      // a second block, same variety
      {
        entityName: "CSB", blockId: "b2", blockName: "5", variety: "NONPAREIL", cropYear: 2025,
        acres: 40, fieldWeightLb: 369_000, hullerWeightLb: 91_000, turnoutPct: 0.2466,
        yoyFieldWeight: null, tgmLbs: 90_000, tgmSource: "MANUAL_ENTRY", gradeDeductionRate: 0.03,
        lossLb: 1_000, sellablePct: 0.989, reconciled: true, tgmNeedsReview: false, sourceMismatch: false,
      },
    ]);
    expect(st.fieldWeightLb).toBe(1_000_000); // 631k + 369k
    expect(st.hullerWeightLb).toBe(200_000); // 109k + 91k
    expect(st.turnoutPct!).toBeCloseTo(0.2, 4); // 200k / 1,000k, recomputed
    expect(st.tgmLbs).toBe(198_652);
    expect(st.acres).toBe(120);
  });
});
