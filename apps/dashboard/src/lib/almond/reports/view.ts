import { en } from "@/copy/en";
import type { ReportListRow } from "./store";

/**
 * The Reports area view-mapper (Story 8.7). Pure, deterministic projection of a farm-scoped
 * `ReportListRow` (from `listReportsForFarm`) into the strings the Server Component renders. Kept out
 * of the page so it is unit-testable offline (zero DB, zero network): the page stays a dumb renderer.
 *
 * Two honesty rules live here, not in the page:
 *  - The KIND label reuses the export skill's plain-name map (en...export.skill.kind), so "meters" /
 *    "billDue" read in the same operator words the download card used; an unknown kind (a future row
 *    written by a newer build) falls back to the stored kind string rather than rendering blank.
 *  - The DOWNLOAD href is the OWNER-SCOPED route from Story 8.6 (`/api/reports/:id/download`), the
 *    only path that re-checks farm ownership before streaming a byte. The list never embeds a blob
 *    URL or the bytes; tapping a row goes through that re-check.
 */

/** A report row projected for the list: display title, plain kind label, when it was made, the
 *  request that produced it, and the owner-scoped download href. No bytes, no blob pathname. */
export type ReportListItem = {
  id: string;
  title: string;
  kindLabel: string;
  madeOn: string;
  requestText: string;
  downloadHref: string;
};

// Plain-name map for each report shape, reused from the export skill so the list and the download
// card speak the same words. Indexed by the stored `kind` string.
const KIND_LABELS = en.shell.almond.export.skill.kind;

// "Made on" date format: month-day-year in UTC, matching the meter-drawer's date rendering, so the
// product reads consistently. A created-at timestamp is shown as the day it was made (operators
// think in days, not minutes), with no time-of-day noise.
const MADE_ON_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Plain operator label for a stored report kind. Falls back to the raw kind string for a shape a
 *  newer build added, so a forward-compatible row is never blank. */
export function reportKindLabel(kind: string): string {
  if (kind in KIND_LABELS) {
    return KIND_LABELS[kind as keyof typeof KIND_LABELS];
  }
  return kind;
}

/** The owner-scoped download path for a report (Story 8.6). The route re-checks farm ownership, so
 *  this href is safe to render: a report from another farm is never listed, and even a guessed id is
 *  rejected server-side. Encoded so a non-cuid id can never break the URL. */
export function reportDownloadHref(id: string): string {
  return `/api/reports/${encodeURIComponent(id)}/download`;
}

/** Project one farm-scoped row into its list item. Pure; the date is formatted deterministically in
 *  UTC so it does not depend on the server's locale or timezone. */
export function toReportListItem(row: ReportListRow): ReportListItem {
  return {
    id: row.id,
    title: row.title,
    kindLabel: reportKindLabel(row.kind),
    madeOn: MADE_ON_FMT.format(row.createdAt),
    requestText: row.requestText,
    downloadHref: reportDownloadHref(row.id),
  };
}
