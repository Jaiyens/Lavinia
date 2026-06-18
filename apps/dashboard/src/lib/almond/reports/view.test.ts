import { describe, expect, it } from "vitest";
import type { ReportListRow } from "./store";
import {
  reportDownloadHref,
  reportKindLabel,
  toReportListItem,
} from "./view";

// Offline unit test for the Reports area view-mapper (Story 8.7). Pure projection, zero DB / network.
// It proves: (1) the kind label reuses the export skill's plain words and falls back to the raw kind
// for a forward-compatible shape; (2) the download href is the OWNER-SCOPED route from Story 8.6 and
// is URL-encoded; (3) the made-on date is formatted deterministically in UTC (no locale/tz drift);
// (4) the projected item carries NO bytes and NO blob pathname.

describe("reportKindLabel", () => {
  it("uses the export skill's plain words for the known shapes", () => {
    expect(reportKindLabel("meters")).toBe("meters");
    expect(reportKindLabel("billDue")).toBe("bill due dates");
  });

  it("falls back to the raw kind string for an unknown (newer-build) shape, never blank", () => {
    expect(reportKindLabel("waterUsage")).toBe("waterUsage");
    expect(reportKindLabel("")).toBe("");
  });
});

describe("reportDownloadHref", () => {
  it("points at the owner-scoped Story 8.6 download route", () => {
    expect(reportDownloadHref("report_1")).toBe("/api/reports/report_1/download");
  });

  it("URL-encodes the id so a non-cuid id cannot break the path", () => {
    expect(reportDownloadHref("a/b id")).toBe("/api/reports/a%2Fb%20id/download");
  });
});

describe("toReportListItem", () => {
  const row: ReportListRow = {
    id: "report_42",
    kind: "meters",
    title: "acme-meters.xlsx",
    requestText: "export my meters",
    // 2026-03-12T23:30:00Z — late UTC to catch a timezone-shifted date bug.
    createdAt: new Date("2026-03-12T23:30:00.000Z"),
  };

  it("projects the row into its display strings", () => {
    expect(toReportListItem(row)).toEqual({
      id: "report_42",
      title: "acme-meters.xlsx",
      kindLabel: "meters",
      madeOn: "Mar 12, 2026",
      requestText: "export my meters",
      downloadHref: "/api/reports/report_42/download",
    });
  });

  it("formats the made-on date in UTC, so a late-UTC timestamp keeps its calendar day", () => {
    // Same instant, rendered as the UTC day (Mar 12), never the prior local day.
    expect(toReportListItem(row).madeOn).toBe("Mar 12, 2026");
  });

  it("carries no bytes and no blob pathname (the list never reads the file)", () => {
    const item = toReportListItem(row);
    expect(JSON.stringify(item)).not.toContain("blobPathname");
    expect(JSON.stringify(item)).not.toContain("bytes");
  });
});
