// Pure parser for Gagan's master worksheet CSV (CARUTHERS Almond Production). The flattened header
// names (Column1..Column67) are meaningless — parse by 0-based COLUMN POSITION and the per-year "FW"
// anchor columns (Jorge's spec). Extracts the reliable STRUCTURE (block/entity/variety/acres) that is
// year-independent, the fully-specified 2025 block (field weight, turnout, huller weight, TGM, packer),
// and per-year field-weight from the anchor columns. Never fabricates: a missing/unparseable cell is
// null; unknown columns (Jorge flagged idx10/13/16 + old "value" columns) are not read.
//
// Identity cols: 0=# (ignore) 1=BLK 2=OWN 3=Var 4=AC.
// Per-year FW anchors (idx of that year's Field Weight): 2025=5 2024=17 2023=29 2022=39 2021=53
//   2020=63 2019=75 2018=86 2017=96.
// 2025 block offsets from the FW anchor (idx5): +0 field weight, +2 turnout %, +3 huller weight,
//   +7 TGM (payable Total Good Meats — MANUAL/Blue Diamond, never derived), +10 packer code.

import { normalizeVariety } from "./variety";

export const FW_ANCHORS: Readonly<Record<number, number>> = {
  2025: 5,
  2024: 17,
  2023: 29,
  2022: 39,
  2021: 53,
  2020: 63,
  2019: 75,
  2018: 86,
  2017: 96,
};

export type WorksheetSeedRow = {
  /** BLK (idx1), verbatim — also the Almond Logic delivery `field` for this block. */
  block: string;
  /** OWN (idx2), owning entity, upper-cased. */
  entity: string;
  /** Var (idx3), normalized to the canonical variety key. */
  variety: string;
  /** AC (idx4), acres for this (block, variety). */
  acres: number;
  /** 2025 field weight (gross to huller, Almond Logic), idx5. */
  fieldWeight2025: number | null;
  /** 2025 source turnout %, idx7. */
  turnout2025: number | null;
  /** 2025 huller weight (Almond Logic), idx8. */
  hullerWeight2025: number | null;
  /** 2025 Total Good Meats (payable, Blue Diamond / manual — never derived), idx12. */
  tgm2025: number | null;
  /** 2025 packer code (bd/sva/vfo/pcp/sg…), idx15, upper-cased, or null. */
  packer2025: string | null;
  /** Field weight per crop year, read from the reliable FW anchor columns (for year-over-year). */
  fieldWeightByYear: Record<number, number>;
};

/** Parse a numeric cell (strips quotes/commas/units/%). Returns null when blank or unparseable. */
function num(v: string | undefined): number | null {
  if (v == null) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse a whole-pound cell (rounds). */
function intOrNull(v: string | undefined): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

function str(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Parse the worksheet rows (already CSV-tokenized into string cells) into structured seed rows. Keeps
 * only real data rows: BLK starts with a digit (so "1","13A","31-1N" pass; junk/labels/`#REF!`/totals
 * fail), AC is a positive number, and OWN + Var are present. Deterministic and pure.
 */
export function parseBatthWorksheet(rows: readonly (readonly string[])[]): WorksheetSeedRow[] {
  const out: WorksheetSeedRow[] = [];
  for (const row of rows) {
    const block = (row[1] ?? "").trim();
    const entity = (row[2] ?? "").trim().toUpperCase();
    const varietyRaw = (row[3] ?? "").trim();
    const acres = num(row[4]);

    // Pre-clean: drop subtotal/label/#REF!/summary rows.
    if (!/^\d/.test(block)) continue;
    if (acres == null || acres <= 0) continue;
    if (entity === "" || varietyRaw === "") continue;

    const a = FW_ANCHORS[2025]!; // 2025 is a known key
    const fieldWeightByYear: Record<number, number> = {};
    for (const [yearStr, anchor] of Object.entries(FW_ANCHORS)) {
      const fw = intOrNull(row[anchor]);
      if (fw != null && fw > 0) fieldWeightByYear[Number(yearStr)] = fw;
    }

    out.push({
      block,
      entity,
      variety: normalizeVariety(varietyRaw),
      acres,
      fieldWeight2025: intOrNull(row[a]),
      turnout2025: num(row[a + 2]),
      hullerWeight2025: intOrNull(row[a + 3]),
      tgm2025: intOrNull(row[a + 7]),
      packer2025: str(row[a + 10])?.toUpperCase() ?? null,
      fieldWeightByYear,
    });
  }
  return out;
}
