// Persist a generated crop report through the EXISTING reports store + blob seam — no new
// persistence, no store internals touched. The store already writes server-authored bytes to a
// private blob and records a GeneratedReport row farm-scoped by inheritance; a crop report fits that
// exactly: the prose is the bytes (UTF-8 text/plain), the numbers-locked context is the params JSON
// (so a refresh is deterministic and the row carries the verified figures), and there is no billed
// coverage so coverageAsOf is null (never faked). The "crop_production" kind was already added to the
// store's GENERATED_REPORT_KINDS union, so this round-trips with no migration.
//
// Scope (farmId) and authorship (createdById) come ONLY from the store deps, never from the model or
// this module — the same Story law the store enforces.

import { storeReport, type ReportStoreDeps, type StoredReport } from "@/lib/almond/reports/store";
import { generateCropReport, type GenerateCropReportDeps, type GeneratedCropReport } from "./generate";
import type { Positions } from "../types";

/** The content type the crop report's prose is stored under: plain UTF-8 text, not a spreadsheet. */
export const CROP_REPORT_CONTENT_TYPE = "text/plain; charset=utf-8";

/** What a persisted crop report returns: the store's row identity plus the generated report so the
 *  caller can render the prose immediately (the bytes are otherwise only re-readable via the
 *  owner-scoped download route). */
export type PersistedCropReport = {
  stored: StoredReport;
  report: GeneratedCropReport;
};

/**
 * Generate a crop report and persist it through the existing store. PURE composition of two existing
 * seams — it constructs nothing of its own and never sets the farm scope (that lives on
 * `storeDeps`). The prose is UTF-8 bytes; the numbers-locked context is the params JSON; coverage is
 * null (a crop position has no billed cycle). `requestText` is captured verbatim for the history.
 *
 * Offline-safe by inheritance: `generateCropReport` defaults to the stub (zero external calls), so a
 * caller that does not inject a live generator persists the deterministic prose.
 */
export async function persistCropReport(
  storeDeps: ReportStoreDeps,
  positions: Positions,
  requestText: string,
  generateDeps: GenerateCropReportDeps = {},
): Promise<PersistedCropReport> {
  const report = await generateCropReport(generateDeps, positions);

  const stored = await storeReport(storeDeps, {
    kind: report.kind,
    title: report.title,
    requestText,
    coverageAsOf: null,
    // The numbers-locked context is plain JSON; recorded as the report's params so a refresh rebuilds
    // the same figures and the row carries the verified position alongside the prose.
    params: { context: report.context },
    bytes: new TextEncoder().encode(report.prose),
    contentType: CROP_REPORT_CONTENT_TYPE,
  });

  return { stored, report };
}
