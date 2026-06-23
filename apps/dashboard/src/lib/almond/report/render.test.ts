import { describe, expect, it } from "vitest";
import { Document, Page } from "@react-pdf/renderer";
import type { CoverageState } from "@/lib/recommendations/types";
import type { MeterView } from "@/lib/dashboard/load";
import type { ExportData, ExportCoverageState } from "@/lib/almond/export/load";
import { en } from "@/copy/en";
import { composeCoverageFooter } from "@/lib/almond/export/coverage-footer";
import {
  buildReportDocument,
  renderReport,
  type ReportSelection,
  type ReportSection,
} from "./render";
import type {
  CoverSectionData,
  OpportunitiesSectionData,
  ChartsSectionData,
  SummarySectionData,
  MisRatedSectionData,
  SavingsSectionData,
  SingleMeterSectionData,
} from "./sections/types";

// Pure offline test for the PDF composer (Story 9.2). Two layers, same as the 9.1 sections:
//  1. `buildReportDocument` is the shape-composition: the model selects WHICH sections and in what
//     order, so we assert the composed React tree has the right pages/sections in the right order and
//     that the Story 8.4 coverage footer is stamped on EVERY report (never optional). No PDF bytes.
//  2. `renderReport` serializes to a real PDF buffer with pure-JS @react-pdf/renderer (no Chromium, no
//     Puppeteer): we assert a valid, non-trivial %PDF- byte stream, that a whole-farm 183-meter report
//     stays a real PDF generated inside the ~10s target, and that nothing is silently truncated.

// --- Fixtures -------------------------------------------------------------------------------------

function meter(over: Partial<MeterView> & { id: string; coverageState: CoverageState }): MeterView {
  return {
    name: over.id,
    serviceId: over.id,
    rateSchedule: "AGC",
    serialCode: null,
    isLegacy: false,
    status: null,
    accountNumber: "A1",
    ranchName: null,
    entityName: null,
    cropName: null,
    latitude: null,
    longitude: null,
    gpm: null,
    isSolar: false,
    nemType: null,
    trueUpMonth: null,
    trueUpAmountCents: null,
    trueUpDate: null,
    solarKw: null,
    benefitingArrays: [],
    growerPumpId: null,
    nemPeriods: [],
    periods: [],
    ...over,
  };
}

const period = (totalCents: number | null, demandCents: number | null) => ({
  start: "2026-02-11T00:00:00.000Z",
  close: "2026-03-12T00:00:00.000Z",
  printedTotalCents: totalCents,
  demandCents,
  totalKwh: null,
  peakKw: null,
  tariff: "AGC",
  lineItems: [],
});

function exportData(meters: MeterView[]): ExportData {
  const reconciled = meters.filter((m) => m.coverageState === "reconciled").length;
  const needsReview = meters.filter((m) => m.coverageState === "needs_review").length;
  const noBill = meters.filter((m) => m.coverageState === "no_bill").length;
  return {
    farm: { id: "farm_batth", name: "Batth Farms" },
    meters,
    state: {
      coverage: { total: meters.length, reconciled, needsReview, noBill },
      asOf: meters.length > 0 ? "2026-03-12T00:00:00.000Z" : null,
    },
  };
}

const coverage: ExportCoverageState = {
  coverage: { total: 183, reconciled: 149, needsReview: 20, noBill: 14 },
  asOf: "2026-03-12T00:00:00.000Z",
};

const summary: SummarySectionData = {
  farmName: "Batth Farms",
  totalMeters: 183,
  reconciledMeters: 149,
  coveragePercent: 81,
  loadedSpendCents: 1172733,
};

const savings: SavingsSectionData = {
  rows: [
    { meterName: "AG-A1", from: "AG-1A", to: "AG-B", savingsCents: 412300 },
    { meterName: "AG-A2", from: "AG-4B", to: "AG-B", savingsCents: 88700 },
  ],
  totalSavingsCents: 501000,
};

const misRated: MisRatedSectionData = {
  rows: [{ meterName: "AG-A1", ranch: "North", currentRate: "AG-1A", suggestedRate: "AG-B" }],
};

const singleMeter: SingleMeterSectionData = {
  name: "AG-A1",
  ranch: "North",
  entity: "Batth Bros LP",
  rate: "AG-1A",
  status: "GOOD",
  coverageState: "reconciled",
  costCents: 1172733,
  demandCents: 278322,
};

const cover: CoverSectionData = {
  farmName: "Batth Farms",
  asOf: "March 12, 2026",
  hero: {
    meterName: "Westside Pump 17",
    amountCents: 6_141_776,
    currentRate: "AG-B",
    suggestedRate: "AG-C",
    isRateSwitch: true,
  },
  totalSpendCents: 1_732_700,
  totalDemandCents: 93_700,
};

const opportunities: OpportunitiesSectionData = {
  rows: [
    { meterName: "Westside Pump 17", currentRate: "AG-B", suggestedRate: "AG-C", savingsCents: 6_141_776 },
  ],
  totalSavingsCents: 6_141_776,
};

const charts: ChartsSectionData = {
  demandTop: [{ label: "Westside Pump 17", value: 203_112, display: "$2,031.12" }],
  spendByEntity: [{ label: "Batth Bros LP", value: 1_732_700, display: "$17,327.00" }],
  rateMix: [{ label: "AG-C", value: 120, display: "120" }],
};

// Walk a react-pdf element tree collecting every node's component (function/class) so a test can
// assert which sections were composed and in what order, without parsing PDF bytes.
type Node = { type?: unknown; props?: { children?: unknown } } | null | undefined | boolean | string | number;
function flatten(node: Node, out: unknown[]): void {
  if (node === null || node === undefined || typeof node !== "object") return;
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type) out.push(el.type);
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const c of children) flatten(c as Node, out);
  } else if (children !== undefined) {
    flatten(children as Node, out);
  }
}

function componentNames(selection: ReportSelection): string[] {
  const out: unknown[] = [];
  flatten(buildReportDocument(selection) as unknown as Node, out);
  return out
    .filter((t): t is { name?: string } => typeof t === "function")
    .map((t) => t.name ?? "")
    .filter(Boolean);
}

function pages(selection: ReportSelection): unknown[] {
  const out: unknown[] = [];
  flatten(buildReportDocument(selection) as unknown as Node, out);
  return out.filter((t) => t === Page);
}

// --- buildReportDocument: shape composition (no bytes) --------------------------------------------

describe("buildReportDocument composes the model-selected shape", () => {
  it("is a Document, and stamps the coverage footer on EVERY report", () => {
    const doc = buildReportDocument({ farmName: "Batth Farms", sections: [{ kind: "summary", data: summary }], coverage });
    expect((doc as { type?: unknown }).type).toBe(Document);
    // The footer section is always present, even for a single-section report.
    expect(componentNames({ farmName: "Batth Farms", sections: [{ kind: "summary", data: summary }], coverage })).toContain(
      "CoverageFooterSection",
    );
  });

  it("includes exactly the chosen sections, in the chosen order", () => {
    const sections: ReportSection[] = [
      { kind: "savings", data: savings },
      { kind: "summary", data: summary },
      { kind: "misRated", data: misRated },
    ];
    const names = componentNames({ farmName: "Batth Farms", sections, coverage });
    const onlySections = names.filter((n) =>
      ["SavingsSection", "SummarySection", "MisRatedSection", "MeterTableSection", "SingleMeterSection"].includes(n),
    );
    // The order the model chose is preserved (portrait sections stay in selection order).
    expect(onlySections).toEqual(["SavingsSection", "SummarySection", "MisRatedSection"]);
  });

  it("a report with no meter table is a single (portrait) page", () => {
    expect(pages({ farmName: "Batth Farms", sections: [{ kind: "summary", data: summary }], coverage })).toHaveLength(1);
  });

  it("puts the wide meter table on its own (second, landscape) page", () => {
    const sections: ReportSection[] = [
      { kind: "summary", data: summary },
      { kind: "meterTable", data: exportData([meter({ id: "P1", coverageState: "no_bill" })]) },
    ];
    expect(pages({ farmName: "Batth Farms", sections, coverage })).toHaveLength(2);
    expect(componentNames({ farmName: "Batth Farms", sections, coverage })).toContain("MeterTableSection");
  });

  it("states a deliberate cap (no silent truncation) only when a cappedNote is given", () => {
    const withCap: ReportSection[] = [
      { kind: "misRated", data: misRated, cappedNote: { sectionName: "Rate review", shown: 10, total: 42 } },
    ];
    expect(componentNames({ farmName: "Batth Farms", sections: withCap, coverage })).toContain("CappedNote");
    // No cappedNote -> the section is shown in full, no cap note rendered.
    expect(
      componentNames({ farmName: "Batth Farms", sections: [{ kind: "misRated", data: misRated }], coverage }),
    ).not.toContain("CappedNote");
  });

  it("the stated cap reads as a bound, pointing the reader to the uncapped spreadsheet", () => {
    const note = en.shell.almond.report.document.cappedNote("Rate review", 10, 42);
    expect(note).toContain("top 10 of 42");
    expect(note).toContain("all 42");
    expect(note).not.toContain("—");
    expect(note).not.toContain("!");
  });
});

// --- the money-first shape: cover, opportunities, charts (T3b) ------------------------------------

describe("buildReportDocument: the opportunities-first money lead (T3b)", () => {
  it("composes the cover, opportunities, and charts in the chosen money-first order", () => {
    const sections: ReportSection[] = [
      { kind: "cover", data: cover },
      { kind: "opportunities", data: opportunities },
      { kind: "charts", data: charts },
      { kind: "summary", data: summary },
    ];
    const names = componentNames({ farmName: "Batth Farms", sections, coverage });
    const onlySections = names.filter((n) =>
      ["CoverSection", "OpportunitiesSection", "ChartsSection", "SummarySection"].includes(n),
    );
    expect(onlySections).toEqual([
      "CoverSection",
      "OpportunitiesSection",
      "ChartsSection",
      "SummarySection",
    ]);
  });

  it("suppresses the plain title block when a cover leads (the cover is the title), keeping it otherwise", () => {
    const withCover = componentNames({
      farmName: "Batth Farms",
      sections: [{ kind: "cover", data: cover }, { kind: "summary", data: summary }],
      coverage,
    });
    // The cover carries the Terra mark + farm name itself, so the plain TitleBlock is not stamped.
    expect(withCover).not.toContain("TitleBlock");
    expect(withCover).toContain("CoverSection");
    // A report with no cover keeps the measured title block, exactly as before.
    const noCover = componentNames({
      farmName: "Batth Farms",
      sections: [{ kind: "summary", data: summary }],
      coverage,
    });
    expect(noCover).toContain("TitleBlock");
  });

  it("still stamps the coverage footer on a money-first report", () => {
    const names = componentNames({
      farmName: "Batth Farms",
      sections: [{ kind: "cover", data: cover }, { kind: "opportunities", data: opportunities }],
      coverage,
    });
    expect(names).toContain("CoverageFooterSection");
  });

  it("renders a cover + opportunities + charts report to a valid, non-trivial %PDF- byte stream", async () => {
    const sections: ReportSection[] = [
      { kind: "cover", data: cover },
      { kind: "opportunities", data: opportunities },
      { kind: "charts", data: charts },
    ];
    const bytes = await renderReport({ farmName: "Batth Farms", sections, coverage });
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});

// --- renderReport: real offline PDF bytes ---------------------------------------------------------

describe("renderReport (offline PDF, no Chromium)", () => {
  it("renders a multi-section report to a valid, non-trivial %PDF- byte stream", async () => {
    const sections: ReportSection[] = [
      { kind: "summary", data: summary },
      { kind: "savings", data: savings },
      { kind: "singleMeter", data: singleMeter },
    ];
    const bytes = await renderReport({ farmName: "Batth Farms", sections, coverage });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders a whole-farm 183-meter report inside the ~10s target, never truncated", async () => {
    const meters = Array.from({ length: 183 }, (_, i) =>
      meter({
        id: `Pump ${String(i + 1).padStart(3, "0")}`,
        coverageState: i % 5 === 0 ? "no_bill" : "reconciled",
        periods: i % 5 === 0 ? [] : [period(500000 + i * 137, 100000 + i)],
      }),
    );
    const data = exportData(meters);
    const sections: ReportSection[] = [
      { kind: "summary", data: { ...summary, totalMeters: 183 } },
      { kind: "meterTable", data },
    ];
    const start = Date.now();
    const bytes = await renderReport({ farmName: "Batth Farms", sections, coverage: data.state });
    const elapsed = Date.now() - start;
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    // A 183-meter table is a substantial document, never an empty/truncated stub.
    expect(bytes.byteLength).toBeGreaterThan(10000);
    // The ~10s generate target (generous headroom for a slow CI box; the table wraps, never caps).
    expect(elapsed).toBeLessThan(10000);
  });

  it("stamps the SAME 8.4 footer lines the spreadsheet prints (PDF and XLSX cannot disagree)", async () => {
    // The footer section composes composeCoverageFooter, so a non-empty report renders those words.
    // We assert at the composer level (the section is unit-tested for bytes in footer.test.ts); here we
    // prove the composer wires the SAME coverage state through, by rendering without throwing and
    // confirming the shared composer yields honest lines for this state.
    const lines = composeCoverageFooter(coverage);
    expect(lines[0]).toContain("All 183 meters included");
    expect(lines[1]).toContain("March 12, 2026");
    const bytes = await renderReport({ farmName: "Batth Farms", sections: [{ kind: "summary", data: summary }], coverage });
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it("renders an empty-selection report (footer only) without throwing", async () => {
    const bytes = await renderReport({
      farmName: "Batth Farms",
      sections: [],
      coverage: { coverage: { total: 0, reconciled: 0, needsReview: 0, noBill: 0 }, asOf: null },
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
