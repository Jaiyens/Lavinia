import { describe, expect, it } from "vitest";
import {
  CROP_PRODUCTION_REPORT_KIND,
  CROP_REPORT_SYSTEM,
  DEFAULT_CROP_REPORT_TITLE,
  generateCropReport,
  stubCropReportGenerator,
  type CropReportTextGenerator,
} from "./generate";
import { buildReportContext } from "./context";
import type { Position, Positions } from "../types";

function pos(overrides: Partial<Position> & Pick<Position, "cropYear" | "variety">): Position {
  return {
    producedPounds: 0,
    committedPounds: 0,
    poolPounds: 0,
    unsoldPounds: 0,
    estimateToSettledGapPounds: null,
    isSettled: false,
    ...overrides,
  };
}

// A position with distinctive figures so any number that appears in the prose is unambiguously
// traceable to (or absent from) the locked context.
const POSITIONS: Positions = [
  pos({
    cropYear: 2026,
    variety: "Nonpareil",
    producedPounds: 248_500,
    committedPounds: 150_000,
    poolPounds: 50_000,
    unsoldPounds: 48_500,
    estimateToSettledGapPounds: 8_500,
    isSettled: true,
  }),
  pos({
    cropYear: 2026,
    variety: "Monterey",
    producedPounds: 100_000,
    committedPounds: 60_000,
    poolPounds: 10_000,
    unsoldPounds: 30_000,
  }),
];

/** Pull every run of digits (commas/sign stripped) out of a body of text, as plain integers. Used to
 *  prove the prose states no number the locked context did not. The cropYear (2026) is a figure in
 *  the context too, so years are legitimately present. */
function numbersIn(text: string): number[] {
  const matches = text.match(/-?[\d,]*\d/g) ?? [];
  return matches.map((m) => Number(m.replace(/,/g, "")));
}

describe("generateCropReport", () => {
  it("returns the crop_production kind, default title, and the locked context", async () => {
    const report = await generateCropReport({}, POSITIONS);
    expect(report.kind).toBe(CROP_PRODUCTION_REPORT_KIND);
    expect(report.kind).toBe("crop_production");
    expect(report.title).toBe(DEFAULT_CROP_REPORT_TITLE);
  });

  it("uses buildReportContext(positions) as the SOLE numeric source (returned context matches)", async () => {
    const report = await generateCropReport({}, POSITIONS);
    // Guard: the returned context is exactly what the pure builder produces for these positions, so
    // there is no second, model-authored source of numbers anywhere in the report.
    expect(report.context).toEqual(buildReportContext(POSITIONS));
  });

  it("with the stub generator, the prose reproduces every locked figure verbatim", async () => {
    const report = await generateCropReport({ generate: stubCropReportGenerator }, POSITIONS);
    // Every formatted figure from the locked context appears in the prose, to the pound.
    expect(report.prose).toContain("248,500 lb");
    expect(report.prose).toContain("150,000 lb");
    expect(report.prose).toContain("50,000 lb");
    expect(report.prose).toContain("48,500 lb");
    expect(report.prose).toContain("+8,500 lb");
    expect(report.prose).toContain("100,000 lb");
    expect(report.prose).toContain("60,000 lb");
    expect(report.prose).toContain("30,000 lb");
    // And the totals, summed only inside the context.
    expect(report.prose).toContain("348,500 lb"); // produced total
  });

  it("PROSE NEVER INVENTS A NUMBER: every number in the prose is present in the locked context", async () => {
    const report = await generateCropReport({}, POSITIONS);
    const allowed = new Set(numbersIn(report.context.block));
    const inProse = numbersIn(report.prose);
    expect(inProse.length).toBeGreaterThan(0);
    for (const n of inProse) {
      expect(allowed.has(n)).toBe(true);
    }
  });

  it("a rogue generator that fabricates a number is caught by the same guard", async () => {
    // A stand-in for a misbehaving model: it appends a pound figure (999,999) that is NOT in the
    // context. The guard (numbers-in-prose subset of numbers-in-context) must flag it — proving the
    // test would actually fail if the model ever invented a figure.
    const rogue: CropReportTextGenerator = async ({ prompt }) => ({
      text: `${prompt}\n\nAnd a fabricated 999,999 lb that the ledger never recorded.`,
    });
    const report = await generateCropReport({ generate: rogue }, POSITIONS);
    const allowed = new Set(numbersIn(report.context.block));
    const inProse = numbersIn(report.prose);
    const fabricated = inProse.filter((n) => !allowed.has(n));
    expect(fabricated).toContain(999_999);
  });

  it("passes the figure-forbidding instruction and the verbatim block to the generator", async () => {
    let capturedSystem = "";
    let capturedPrompt = "";
    const spy: CropReportTextGenerator = async ({ system, prompt }) => {
      capturedSystem = system;
      capturedPrompt = prompt;
      return { text: prompt };
    };
    await generateCropReport({ generate: spy }, POSITIONS);
    expect(capturedSystem).toBe(CROP_REPORT_SYSTEM);
    expect(capturedSystem).toContain("Do NOT introduce any number");
    // The prompt carries the exact verbatim block as the only figures.
    expect(capturedPrompt).toContain(buildReportContext(POSITIONS).block);
  });

  it("honors a title override", async () => {
    const report = await generateCropReport({ title: "2026 Almond Position" }, POSITIONS);
    expect(report.title).toBe("2026 Almond Position");
  });

  it("is offline by default: no generator injected, no external call, deterministic prose", async () => {
    const a = await generateCropReport({}, POSITIONS);
    const b = await generateCropReport({}, POSITIONS);
    expect(a.prose).toBe(b.prose);
  });
});
