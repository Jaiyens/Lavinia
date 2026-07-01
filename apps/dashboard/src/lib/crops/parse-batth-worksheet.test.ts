import { describe, expect, it } from "vitest";
import { parseBatthWorksheet } from "./parse-batth-worksheet";

/** Build a sparse row: fill the given 0-based indices, blanks elsewhere up to idx 96 (the 2017 anchor). */
function mkRow(vals: Record<number, string>): string[] {
  const row: string[] = [];
  for (let i = 0; i <= 96; i++) row[i] = vals[i] ?? "";
  return row;
}

// Block 1, CSB, Nonpareil — the real row 1 (and the golden fixture: FW 631,700 / HW 109,388 / TO 17.3
// / TGM 108,652). idx17 = 2024 FW, idx29 = 2023 FW.
const ROW1 = mkRow({
  0: "1", 1: "1", 2: "CSB", 3: "np", 4: "80",
  5: " 631,700 ", 6: "28%", 7: "17.3%", 8: " 109,388 ",
  12: " 108,652 ", 15: " bd ",
  17: " 493,400 ", 29: " 595,500 ",
});
// A weird block id + code variety that survive (13A block, "ald").
const ROW13A = mkRow({ 1: "13A", 2: "FLP", 3: "ald", 4: "160", 5: " 1,215,440 ", 12: " 278,937 ", 15: " sva/p " });
// Junk rows that must be dropped: a totals row (no block), a summary row (no block), a #REF! row.
const TOTALS = mkRow({ 0: " 1,465 ", 4: "7998", 5: " 61,109,580 " });
const SUMMARY = mkRow({ 3: "np", 4: " 2,016 " });
const REF = mkRow({ 1: "#REF!", 4: "10" });

describe("parseBatthWorksheet", () => {
  const rows = parseBatthWorksheet([ROW1, ROW13A, TOTALS, SUMMARY, REF]);

  it("keeps only real data rows (block starts with a digit, acres numeric, entity+variety present)", () => {
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.block)).toEqual(["1", "13A"]);
  });

  it("parses the block-1 golden row: structure + 2025 figures", () => {
    const r = rows[0]!;
    expect(r).toMatchObject({
      block: "1",
      entity: "CSB",
      variety: "NONPAREIL",
      acres: 80,
      fieldWeight2025: 631_700,
      turnout2025: 17.3,
      hullerWeight2025: 109_388,
      tgm2025: 108_652,
      packer2025: "BD",
    });
  });

  it("reads field weight per year from the anchor columns", () => {
    expect(rows[0]!.fieldWeightByYear).toMatchObject({ 2025: 631_700, 2024: 493_400, 2023: 595_500 });
  });

  it("normalizes variety codes (ald -> ALDRICH) and keeps odd block ids", () => {
    expect(rows[1]!.variety).toBe("ALDRICH");
    expect(rows[1]!.block).toBe("13A");
    expect(rows[1]!.tgm2025).toBe(278_937);
  });
});
