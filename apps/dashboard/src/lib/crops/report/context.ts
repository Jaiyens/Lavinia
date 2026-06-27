// The numbers-locked report context: the deterministic, single source of EVERY figure a crop
// production report may state. It is built PURELY from a Positions array (itself produced only by
// recomputePositions over the ledger) — no model, no clock, no DB, no Math. The report prose is
// written AROUND these locked numbers; the model is handed the formatted block below and told to
// copy it verbatim, never to restate, reformat, or compute a pound. If a number is not in this
// context it may not appear in the report. Same Positions in => same context out, to the pound.

import type { Positions } from "../types";

/** One cell's locked figures, mirroring a Position but pre-formatted for the report. Every pound
 *  here is copied straight off the Position (never recomputed); the formatted strings are the exact
 *  text the prose must use so the model never has to render a number itself. */
export type CropReportCell = {
  cropYear: number;
  variety: string;
  producedPounds: number;
  committedPounds: number;
  poolPounds: number;
  unsoldPounds: number;
  /** How many pounds a settlement moved the estimate (settled - estimate), null when still an
   *  estimate-only cell. Surfaced honestly; the report states the gap wherever it is non-null. */
  estimateToSettledGapPounds: number | null;
  /** True once a packer settlement has landed for this cell — the report labels it FINAL vs the
   *  ESTIMATE label otherwise. The model keys off this, it never decides settled-ness itself. */
  isSettled: boolean;
  /** The label the prose uses for this cell's trust level ("settled" or "estimate"). */
  basis: CropReportBasis;
  /** The whole-pound figures formatted with thousands separators, ready to drop into prose. */
  formatted: {
    producedPounds: string;
    committedPounds: string;
    poolPounds: string;
    unsoldPounds: string;
    /** Present (a signed "+N" / "-N" pounds string) only when there is a settlement gap. */
    estimateToSettledGapPounds: string | null;
  };
};

/** The trust basis label for a cell. A cell is "settled" once any packer settlement has landed for
 *  it (isSettled), otherwise it is still an "estimate" off the grower's yield tool. */
export type CropReportBasis = "settled" | "estimate";

/** The locked totals across every cell, summed ONLY from the per-cell pound figures already in the
 *  position (this is the sole place a report total is produced, by integer addition of locked
 *  numbers — still no model, no recompute of the underlying position). */
export type CropReportTotals = {
  producedPounds: number;
  committedPounds: number;
  poolPounds: number;
  unsoldPounds: number;
  /** How many cells in total, and how many are settled vs still estimate, so the prose can state
   *  the mix without counting anything itself. */
  cellCount: number;
  settledCellCount: number;
  estimateCellCount: number;
  formatted: {
    producedPounds: string;
    committedPounds: string;
    poolPounds: string;
    unsoldPounds: string;
  };
};

/**
 * The whole numbers-locked context. `cells` and `totals` are the structured figures (used by tests
 * and by any caller that wants the numbers directly); `block` is the stable, fully-formatted text
 * the model is instructed to copy verbatim into its prose. Nothing else is a legitimate source of a
 * number for the report.
 */
export type CropReportContext = {
  cells: readonly CropReportCell[];
  totals: CropReportTotals;
  /** A deterministic, fully-formatted plain-text block: the ONLY figures the prose may state, laid
   *  out so the model copies numbers verbatim. Byte-stable for the same Positions input. */
  block: string;
};

/** Format a whole-pound integer with thousands separators, e.g. 248500 -> "248,500". Deterministic
 *  (fixed en-US grouping), so the context block is byte-stable regardless of host locale. */
function formatPounds(pounds: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(pounds);
}

/** Format a signed gap, e.g. +8500 -> "+8,500", -1200 -> "-1,200". The sign is always shown so the
 *  prose can state the direction the settlement moved the estimate without computing anything. */
function formatGap(pounds: number): string {
  const sign = pounds < 0 ? "-" : "+";
  return `${sign}${formatPounds(Math.abs(pounds))}`;
}

function basisOf(isSettled: boolean): CropReportBasis {
  return isSettled ? "settled" : "estimate";
}

/**
 * Build the numbers-locked context from a Positions array. PURE and deterministic: it copies every
 * pound off the positions, sums the totals by integer addition, and renders the verbatim block. It
 * NEVER reorders the input beyond a stable sort, never invents a cell, and never derives a pound the
 * position did not already carry (unsold and the gap come straight from the Position).
 *
 * The output `block` is the exact text the model is told to copy: a header, one line per cell with
 * its four pound figures and trust label (and the settlement gap where present), then a TOTALS line.
 */
export function buildReportContext(positions: Positions): CropReportContext {
  // Stable order: (cropYear asc, variety asc). recomputePositions already sorts this way, but we
  // re-sort defensively so the block is byte-stable no matter how the caller assembled the array.
  const ordered = [...positions].sort(
    (a, b) =>
      a.cropYear - b.cropYear || (a.variety < b.variety ? -1 : a.variety > b.variety ? 1 : 0),
  );

  const cells: CropReportCell[] = ordered.map((p) => {
    const gapFormatted =
      p.estimateToSettledGapPounds === null ? null : formatGap(p.estimateToSettledGapPounds);
    return {
      cropYear: p.cropYear,
      variety: p.variety,
      producedPounds: p.producedPounds,
      committedPounds: p.committedPounds,
      poolPounds: p.poolPounds,
      unsoldPounds: p.unsoldPounds,
      estimateToSettledGapPounds: p.estimateToSettledGapPounds,
      isSettled: p.isSettled,
      basis: basisOf(p.isSettled),
      formatted: {
        producedPounds: formatPounds(p.producedPounds),
        committedPounds: formatPounds(p.committedPounds),
        poolPounds: formatPounds(p.poolPounds),
        unsoldPounds: formatPounds(p.unsoldPounds),
        estimateToSettledGapPounds: gapFormatted,
      },
    };
  });

  // Totals: integer addition of the locked per-cell pounds only. No re-derivation of the position.
  let producedPounds = 0;
  let committedPounds = 0;
  let poolPounds = 0;
  let unsoldPounds = 0;
  let settledCellCount = 0;
  for (const cell of cells) {
    producedPounds += cell.producedPounds;
    committedPounds += cell.committedPounds;
    poolPounds += cell.poolPounds;
    unsoldPounds += cell.unsoldPounds;
    if (cell.isSettled) settledCellCount += 1;
  }
  const totals: CropReportTotals = {
    producedPounds,
    committedPounds,
    poolPounds,
    unsoldPounds,
    cellCount: cells.length,
    settledCellCount,
    estimateCellCount: cells.length - settledCellCount,
    formatted: {
      producedPounds: formatPounds(producedPounds),
      committedPounds: formatPounds(committedPounds),
      poolPounds: formatPounds(poolPounds),
      unsoldPounds: formatPounds(unsoldPounds),
    },
  };

  return { cells, totals, block: renderBlock(cells, totals) };
}

/**
 * Render the verbatim, byte-stable figures block. This is the literal text the model is told to copy
 * — every number the prose may state appears here exactly once, already formatted, and nowhere does
 * the block ask the model to add anything. Lines are joined with "\n" for a stable single string.
 */
function renderBlock(
  cells: readonly CropReportCell[],
  totals: CropReportTotals,
): string {
  const lines: string[] = [];
  lines.push("VERIFIED CROP POSITION (pounds, whole). Copy every figure exactly; add none.");
  lines.push("");

  if (cells.length === 0) {
    lines.push("No crop positions recorded.");
  } else {
    for (const cell of cells) {
      const label = cell.basis === "settled" ? "SETTLED (final)" : "ESTIMATE";
      lines.push(`${cell.cropYear} ${cell.variety} — ${label}`);
      lines.push(`  Produced:  ${cell.formatted.producedPounds} lb`);
      lines.push(`  Committed: ${cell.formatted.committedPounds} lb`);
      lines.push(`  Pool:      ${cell.formatted.poolPounds} lb`);
      lines.push(`  Unsold:    ${cell.formatted.unsoldPounds} lb`);
      if (cell.formatted.estimateToSettledGapPounds !== null) {
        lines.push(
          `  Settlement gap vs estimate: ${cell.formatted.estimateToSettledGapPounds} lb`,
        );
      }
      lines.push("");
    }

    lines.push("TOTALS (all cells)");
    lines.push(`  Produced:  ${totals.formatted.producedPounds} lb`);
    lines.push(`  Committed: ${totals.formatted.committedPounds} lb`);
    lines.push(`  Pool:      ${totals.formatted.poolPounds} lb`);
    lines.push(`  Unsold:    ${totals.formatted.unsoldPounds} lb`);
    lines.push(
      `  Cells: ${totals.cellCount} (${totals.settledCellCount} settled, ${totals.estimateCellCount} estimate)`,
    );
  }

  return lines.join("\n");
}
