import { describe, expect, it } from "vitest";
import {
  deriveExportInput,
  deriveNavigateInput,
  deriveReportInput,
  isExportTurn,
  isNavigationTurn,
  isReportTurn,
} from "./responder";

// Pure tests for the stub's offline navigation parsing (Story 7.4). The stub is a deterministic
// fixture that drives the SAME shipped `navigate` skill so e2e/CI prove navigation offline; the
// end-to-end "stub emits a data-navigate part" assertion lives in tools.db.test.ts (needs a seeded
// farm). Here we pin the detector and the parser.

describe("isNavigationTurn", () => {
  it("detects a request to drive the screen (open verb or lens word)", () => {
    expect(isNavigationTurn("open westside pump 17")).toBe(true);
    expect(isNavigationTurn("show me the map")).toBe(true);
    expect(isNavigationTurn("switch to the table")).toBe(true); // caught by the lens word "table"
  });

  it("leaves a data question (or a free-text filter the stub cannot do) for the grounded path", () => {
    expect(isNavigationTurn("how complete is my billing data")).toBe(false);
    expect(isNavigationTurn("which meters cost me the most")).toBe(false);
    expect(isNavigationTurn("where is the money going")).toBe(false);
    // Free-text filtering is not a stub capability (lower-cased text vs case-sensitive exact filter).
    expect(isNavigationTurn("filter to ag-4")).toBe(false);
  });
});

describe("deriveNavigateInput", () => {
  it("a lens word wins", () => {
    expect(deriveNavigateInput("show me the map")).toEqual({ lens: "map" });
    expect(deriveNavigateInput("switch to chart")).toEqual({ lens: "chart" });
  });

  it("an open/show verb opens the named meter (query preserved for the resolver)", () => {
    expect(deriveNavigateInput("open westside pump 17")).toEqual({
      open: "meter",
      query: "westside pump 17",
    });
    expect(deriveNavigateInput("show me dairy field pump 4")).toEqual({
      open: "meter",
      query: "dairy field pump 4",
    });
  });

  it("a non-actionable request yields nothing (incl. free-text filters, left to the live model)", () => {
    expect(deriveNavigateInput("hello almond")).toEqual({});
    expect(deriveNavigateInput("filter to ag-4")).toEqual({});
  });
});

describe("isExportTurn", () => {
  it("detects a request for a spreadsheet / download", () => {
    expect(isExportTurn("export my meters")).toBe(true);
    expect(isExportTurn("can i download a spreadsheet")).toBe(true);
    expect(isExportTurn("give me an excel of bill due dates")).toBe(true);
  });

  it("leaves a plain data question for the grounded path", () => {
    expect(isExportTurn("which meters cost me the most")).toBe(false);
    expect(isExportTurn("how complete is my billing data")).toBe(false);
  });
});

describe("deriveExportInput", () => {
  it("picks the bill-due table when the ask is about due/closing dates", () => {
    expect(deriveExportInput("export the bill due dates")).toEqual({ table: "billDue" });
    expect(deriveExportInput("download closing dates")).toEqual({ table: "billDue" });
  });

  it("defaults to the meter inventory otherwise (the honest full export)", () => {
    expect(deriveExportInput("export my meters")).toEqual({ table: "meters" });
    expect(deriveExportInput("download a spreadsheet")).toEqual({ table: "meters" });
  });
});

describe("isReportTurn", () => {
  it("detects a request for a PDF / report / printout", () => {
    expect(isReportTurn("make me a pdf")).toBe(true);
    expect(isReportTurn("can you build a report")).toBe(true);
    expect(isReportTurn("i want a one-pager for the bank")).toBe(true);
    expect(isReportTurn("download a pdf of my farm")).toBe(true);
  });

  it("leaves a plain spreadsheet ask and a data question alone (report verb only)", () => {
    // A spreadsheet ask with no pdf/report word is NOT a report turn (it routes to the export skill).
    expect(isReportTurn("export my meters")).toBe(false);
    expect(isReportTurn("download a spreadsheet")).toBe(false);
    expect(isReportTurn("which meters cost me the most")).toBe(false);
  });
});

describe("deriveReportInput (offline section shape, never an empty PDF)", () => {
  it("always includes the summary and the full meter table (the honest whole-farm default)", () => {
    const input = deriveReportInput("make me a pdf");
    expect(input.sections).toContain("summary");
    expect(input.sections).toContain("meterTable");
  });

  it("adds the savings and rate-review sections when the ask names them", () => {
    const input = deriveReportInput("pdf of my savings and wrong rate meters");
    expect(input.sections).toContain("savings");
    expect(input.sections).toContain("misRated");
  });

  it("derives no free-text filter or meter name (left to the live model, like export/navigate)", () => {
    const input = deriveReportInput("report for ag-4 on north ranch");
    expect(input.rate).toBeUndefined();
    expect(input.entity).toBeUndefined();
    expect(input.ranch).toBeUndefined();
    expect(input.meter).toBeUndefined();
  });
});
