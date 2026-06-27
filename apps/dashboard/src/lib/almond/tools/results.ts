// The typed contracts for what each crop tool RETURNS — the single source of truth the tools produce
// and the result React components render. Every number in these shapes is produced by a pure crop
// function (recomputePositions / the Track D views), NEVER by the model and NEVER by a component: the
// components only format. Each result is a discriminated union on `kind`, and every tool can return
// an explicit EMPTY variant so an absent figure renders an honest empty state, never a blank or a
// fabricated zero.

import type { CropYearBar, PackerRow } from "@/lib/crops/views";
import type { Position } from "@/lib/crops/types";

/** The shared empty result. A tool returns this when its scoped query found nothing for the farm. */
export type EmptyResult = {
  kind: "empty";
  /** Plain-operator-English reason, e.g. "No 2026 position for this farm yet." */
  reason: string;
};

// --- position-card -------------------------------------------------------------------------------
/**
 * The recomputed position for ONE crop year: the per-variety cells plus the year roll-up (produced /
 * committed / pool / unsold + the settlement gap + isSettled). Every figure is a `Position` /
 * `CropYearSummary` field straight from recomputePositions / cropYearSummary.
 */
export type PositionCardResult =
  | {
      kind: "position";
      cropYear: number;
      /** The per-variety position cells for the year (already sorted by variety). */
      cells: readonly Position[];
      /** The year roll-up the header summarizes. */
      summary: {
        producedPounds: number;
        committedPounds: number;
        poolPounds: number;
        unsoldPounds: number;
        /** True iff every variety cell in the year has a live packer settlement. */
        allSettled: boolean;
        /** Summed estimate-to-settled movement across the year; null when no settlement landed. */
        gapPounds: number | null;
      };
    }
  | EmptyResult;

// --- packer-table --------------------------------------------------------------------------------
/** The pounds-by-packer rows (from packerRows), optionally scoped to one crop year. */
export type PackerTableResult =
  | {
      kind: "packerTable";
      /** When set, the rows were filtered to this crop year. Null = all years. */
      cropYear: number | null;
      rows: readonly PackerRow[];
    }
  | EmptyResult;

// --- yoy-chart -----------------------------------------------------------------------------------
/** The year-over-year bars (from cropYearBars): one bar per crop year, rolled across varieties. */
export type YoYChartResult =
  | {
      kind: "yoyChart";
      bars: readonly CropYearBar[];
    }
  | EmptyResult;

// --- find-report (retrieval) ---------------------------------------------------------------------
/** One retrieved document chunk: its source key, a snippet, and the cosine score that ranked it. */
export type ReportHit = {
  id: string;
  r2Key: string;
  cropYear: number | null;
  snippet: string;
  score: number;
};

/**
 * The retrieval result. Distinct from `empty`: `unavailable` means the capability is OFF (no ZDR key
 * / no pgvector extension) — the tool made NO live call and fabricated nothing; `empty` means
 * retrieval ran and matched nothing. Both render explicit, honest states (never a fake citation).
 */
export type FindReportResult =
  | { kind: "reports"; query: string; hits: readonly ReportHit[] }
  | { kind: "unavailable"; reason: string }
  | EmptyResult;

/** The union of every crop tool's output, for exhaustive handling at the render switch. */
export type CropToolResult =
  | PositionCardResult
  | PackerTableResult
  | YoYChartResult
  | FindReportResult;
