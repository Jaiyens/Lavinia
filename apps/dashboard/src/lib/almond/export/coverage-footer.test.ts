import { describe, expect, it } from "vitest";
import type { ExportCoverageState } from "./load";
import {
  composeCoverageFooter,
  coveragePercent,
  asOfLine,
} from "./coverage-footer";

// Pure offline unit test for the SHARED coverage / as-of footer composer (Story 8.4). No Prisma, no
// fs, no clock: we hand it the coverage / as-of state the 8.1 loader travels with the rows and
// assert the words. This is the one source of coverage honesty - the 8.2 XLSX builder and the Epic 9
// PDF composer both render exactly these lines - so it is pinned here, not re-asserted per format.

/** Build an ExportCoverageState; reconciled defaults to "all loaded" unless overridden. */
function state(over: Partial<ExportCoverageState["coverage"]> & { asOf?: string | null } = {}): ExportCoverageState {
  const total = over.total ?? 0;
  const reconciled = over.reconciled ?? total;
  return {
    coverage: {
      total,
      reconciled,
      needsReview: over.needsReview ?? 0,
      noBill: over.noBill ?? Math.max(total - reconciled - (over.needsReview ?? 0), 0),
    },
    // Distinguish "omitted" (default to a real close) from an explicit null (honest absence).
    asOf: "asOf" in over ? (over.asOf ?? null) : "2026-03-12T00:00:00.000Z",
  };
}

describe("coveragePercent", () => {
  it("is the whole-percent of meters carrying loaded billing", () => {
    expect(coveragePercent(state({ total: 100, reconciled: 82 }))).toBe(82);
  });

  it("FLOORS so a partial farm never rounds up to imply more billing than is on file", () => {
    // 149/183 = 81.4...%; flooring keeps it honest at 81, never 82.
    expect(coveragePercent(state({ total: 183, reconciled: 149 }))).toBe(81);
  });

  it("is 100 when every meter has loaded billing", () => {
    expect(coveragePercent(state({ total: 4, reconciled: 4 }))).toBe(100);
  });

  it("is 0 for an empty farm, never a divide-by-zero", () => {
    expect(coveragePercent(state({ total: 0, reconciled: 0 }))).toBe(0);
    expect(Number.isNaN(coveragePercent(state({ total: 0 })))).toBe(false);
  });
});

describe("asOfLine", () => {
  it("formats the freshest billed close as a plain UTC date", () => {
    expect(asOfLine("2026-03-12T00:00:00.000Z")).toBe(
      "Figures as of the bill closing March 12, 2026.",
    );
  });

  it("prints the SAME UTC day regardless of the runner's timezone (no day shift)", () => {
    // A UTC-midnight close must read as that day even when interpreted late in another zone.
    expect(asOfLine("2026-03-12T00:00:00.000Z")).toContain("March 12, 2026");
  });

  it("states honest absence when no bill has posted, never a fabricated date", () => {
    const line = asOfLine(null);
    expect(line).toBe("No bills have posted yet, so no dollar figures are shown.");
    expect(line).not.toMatch(/as of the bill closing/);
  });
});

describe("composeCoverageFooter", () => {
  it("returns two lines: the coverage statement then the as-of", () => {
    const lines = composeCoverageFooter(state({ total: 3, reconciled: 1, needsReview: 1, asOf: "2026-03-12T00:00:00.000Z" }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("All 3 meters included");
    expect(lines[1]).toContain("Figures as of the bill closing March 12, 2026");
  });

  it("states partial billing plainly as a whole-percent complete (e.g. 82% complete)", () => {
    const lines = composeCoverageFooter(state({ total: 50, reconciled: 41 })); // 82%
    expect(lines[0]).toContain("82% complete");
    expect(lines[0]).toContain("41 have loaded billing");
    expect(lines[0]).toContain("All 50 meters included");
  });

  it("says 100% complete plainly when every meter has loaded billing", () => {
    const lines = composeCoverageFooter(state({ total: 4, reconciled: 4 }));
    expect(lines[0]).toContain("100% complete");
    expect(lines[0]).toContain("Every meter has loaded billing");
  });

  it("states honest absence of any bill in the as-of line, never a fabricated date", () => {
    const lines = composeCoverageFooter(state({ total: 2, reconciled: 0, asOf: null }));
    expect(lines[1]).toBe("No bills have posted yet, so no dollar figures are shown.");
    expect(lines.join("\n")).not.toMatch(/as of the bill closing/);
  });

  it("handles an empty farm with an honest line, no divide-by-zero, no fabricated figure", () => {
    const lines = composeCoverageFooter(state({ total: 0, reconciled: 0, asOf: null }));
    expect(lines[0]).toBe("No meters on file yet, so this sheet is empty.");
    expect(lines[0]).not.toMatch(/NaN|Infinity/);
  });

  it("contains no em dashes or exclamation marks (Almond voice)", () => {
    const samples = [
      composeCoverageFooter(state({ total: 50, reconciled: 41 })),
      composeCoverageFooter(state({ total: 4, reconciled: 4 })),
      composeCoverageFooter(state({ total: 2, reconciled: 0, asOf: null })),
      composeCoverageFooter(state({ total: 0, reconciled: 0, asOf: null })),
    ].flat();
    for (const line of samples) {
      expect(line).not.toContain("—"); // em dash
      expect(line).not.toContain("!");
    }
  });
});
