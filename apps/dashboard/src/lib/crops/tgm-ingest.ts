// TGM (Total Good Meats) ingestion — the pure layer. TGM is the payable good-meats figure the
// worksheet's Good-meats / Sellable columns read. It is CUSTOMER-SOURCED ONLY: a Blue Diamond
// settlement statement (via the ZDR pound-gate) or a manual entry the grower stands behind. It is
// NEVER derived from the Almond Logic scrape — a DB check constraint forbids ALMOND_LOGIC, and this
// module refuses it too (defense in depth). No arithmetic invents a pound here: statement pounds come
// from the gated extraction verbatim; a manual figure is the grower's own stated number.
//
// Grain: one TgmRecord per (cropYear, blockId, variety). Both ingestion paths REQUIRE a block so the
// figure attaches to a worksheet row (worksheetRows keys TGM by block+variety; a block-less TGM would
// attach to nothing).

import type { ExtractionResult } from "./extract/reader";
import type { PoundCoverage } from "./types";
import { normalizeVariety } from "./variety";

/** The two legitimate TGM provenances. ALMOND_LOGIC is forbidden (TGM is never scrape-derived). */
export const TGM_SOURCES = ["BLUE_DIAMOND_STATEMENT", "MANUAL_ENTRY"] as const;
export type TgmSource = (typeof TGM_SOURCES)[number];

/** A validated TGM write, ready for the DB writer. Every field here is customer-sourced or defaulted. */
export type TgmWriteInput = {
  cropYear: number;
  blockId: string;
  variety: string; // canonical (normalizeVariety)
  tgmLbs: number; // whole pounds
  gradeDeductionRate: number;
  source: TgmSource;
  controlTotalPounds: number | null;
  coverageState: PoundCoverage;
};

/** Grade deduction default (3%), matching the schema default and the seed. */
export const DEFAULT_GRADE_DEDUCTION_RATE = 0.03;

/** Throw if a source is not customer-sourced. Belt-and-suspenders with the DB check constraint. */
export function assertCustomerSourced(source: string): asserts source is TgmSource {
  if (!TGM_SOURCES.includes(source as TgmSource)) {
    throw new Error(`TGM source must be customer-sourced (${TGM_SOURCES.join(" | ")}); got ${source}`);
  }
}

/** A crop year is plausible between the first modern almond records and the near future. */
function isPlausibleCropYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

/** A grade-deduction rate is a fraction in [0, 1). */
function isPlausibleRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate < 1;
}

export type ManualTgmRaw = {
  cropYear: number;
  blockId: string;
  variety: string;
  tgmLbs: number;
  gradeDeductionRate?: number;
};

/**
 * Validate + normalize a MANUAL good-meats entry into a write input. A manual figure is a stated
 * settled number the grower stands behind, so its coverage is "reconciled" with no separate control
 * total. Returns null on any invalid field (the caller surfaces the calm error) rather than writing a
 * fabricated or malformed row.
 */
export function manualTgmInput(raw: ManualTgmRaw): TgmWriteInput | null {
  if (!isPlausibleCropYear(raw.cropYear)) return null;
  if (typeof raw.blockId !== "string" || raw.blockId === "") return null;
  if (!Number.isInteger(raw.tgmLbs) || raw.tgmLbs <= 0) return null;
  const variety = normalizeVariety(raw.variety);
  if (variety === "UNKNOWN") return null;
  const rate = raw.gradeDeductionRate ?? DEFAULT_GRADE_DEDUCTION_RATE;
  if (!isPlausibleRate(rate)) return null;
  return {
    cropYear: raw.cropYear,
    blockId: raw.blockId,
    variety,
    tgmLbs: raw.tgmLbs,
    gradeDeductionRate: rate,
    source: "MANUAL_ENTRY",
    controlTotalPounds: null,
    coverageState: "reconciled",
  };
}

/**
 * Map a gated Blue Diamond settlement extraction onto TGM write inputs for one target block + crop
 * year. Each gated variety row becomes one TgmRecord; the pounds come from the extraction verbatim
 * (the pound-gate already certified them), the coverage rides through from the gate's verdict, and the
 * statement's printed control total is carried for the audit trail. Rows with non-positive pounds are
 * dropped (a settlement never settles zero good meats). Same-variety rows are summed (a statement may
 * print a variety across multiple pool lines). Pure — the AI already ran; this only shapes its
 * gate-approved output.
 */
export function tgmInputsFromStatement(
  result: ExtractionResult,
  target: { cropYear: number; blockId: string; gradeDeductionRate?: number },
): TgmWriteInput[] {
  const rate = target.gradeDeductionRate ?? DEFAULT_GRADE_DEDUCTION_RATE;
  const byVariety = new Map<string, number>();
  for (const row of result.rows) {
    if (!Number.isInteger(row.pounds) || row.pounds <= 0) continue;
    const variety = normalizeVariety(row.variety);
    byVariety.set(variety, (byVariety.get(variety) ?? 0) + row.pounds);
  }
  return [...byVariety.entries()].map(([variety, tgmLbs]) => ({
    cropYear: target.cropYear,
    blockId: target.blockId,
    variety,
    tgmLbs,
    gradeDeductionRate: rate,
    source: "BLUE_DIAMOND_STATEMENT" as const,
    controlTotalPounds: result.controlTotalPounds,
    coverageState: result.coverage,
  }));
}
