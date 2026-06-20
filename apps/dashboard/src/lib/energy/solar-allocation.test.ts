import { describe, expect, it } from "vitest";
import {
  ALLOCATION_TOLERANCE_PP,
  allocateArray,
  classifyProgramType,
  type AllocationMeterInput,
} from "./solar-allocation";

// C-2 (FR8): the usage-proportional NEMA allocation share math, proven in isolation from the DB edge.
// The shares are buildable now from usage; the credit DOLLAR is never computed here (honest-blank,
// FR10). Every null/empty/divide-by-zero case is pinned so the wedge never fabricates a split.

function m(pumpId: string, cumulativeKwh: number | null): AllocationMeterInput {
  return { pumpId, meterName: pumpId.toUpperCase(), cumulativeKwh };
}

describe("allocateArray", () => {
  it("splits two meters by their usage: A/(A+B) and B/(A+B), summing to 1", () => {
    const result = allocateArray("arr-1", "840 kW", [m("a", 30), m("b", 10)]);
    expect(result.arrayId).toBe("arr-1");
    expect(result.arrayName).toBe("840 kW");
    expect(result.shares.map((s) => s.share)).toEqual([0.75, 0.25]);
    const sum = result.shares.reduce((acc, s) => acc + (s.share ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(result.notOnFilePumpIds).toEqual([]);
  });

  it("preserves input order in the shares array", () => {
    const result = allocateArray("arr-1", null, [m("b", 10), m("a", 30)]);
    expect(result.shares.map((s) => s.pumpId)).toEqual(["b", "a"]);
    expect(result.shares.map((s) => s.share)).toEqual([0.25, 0.75]);
  });

  it("excludes a null-usage meter from the denominator and returns it as not-on-file (never zero)", () => {
    const result = allocateArray("arr-1", null, [m("a", 30), m("b", 10), m("c", null)]);
    // The denominator is 40 (only a + b), so the split is unaffected by c's absence.
    expect(result.shares.find((s) => s.pumpId === "a")?.share).toBe(0.75);
    expect(result.shares.find((s) => s.pumpId === "b")?.share).toBe(0.25);
    // c is not-on-file: share null (NOT 0, which would read as dropped) and collected explicitly.
    expect(result.shares.find((s) => s.pumpId === "c")?.share).toBeNull();
    expect(result.notOnFilePumpIds).toEqual(["c"]);
    // The non-null shares still sum to 1.
    const sum = result.shares.reduce((acc, s) => acc + (s.share ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("returns shares=[] for empty input (never a divide-by-zero)", () => {
    const result = allocateArray("arr-1", null, []);
    expect(result.shares).toEqual([]);
    expect(result.notOnFilePumpIds).toEqual([]);
  });

  it("returns every meter not-on-file when all usage is null (never a divide-by-zero)", () => {
    const result = allocateArray("arr-1", null, [m("a", null), m("b", null)]);
    expect(result.shares.map((s) => s.share)).toEqual([null, null]);
    expect(result.notOnFilePumpIds).toEqual(["a", "b"]);
  });

  it("treats a single benefiting meter as the whole array (share 1)", () => {
    const result = allocateArray("arr-1", null, [m("a", 42)]);
    expect(result.shares[0]?.share).toBe(1);
    expect(result.notOnFilePumpIds).toEqual([]);
  });

  it("treats zero usage as honest absence: an all-zero array is not-on-file, never a divide-by-zero", () => {
    const result = allocateArray("arr-1", null, [m("a", 0), m("b", 0)]);
    // Denominator is 0, so neither meter gets a fabricated split.
    expect(result.shares.map((s) => s.share)).toEqual([null, null]);
    expect(result.notOnFilePumpIds).toEqual(["a", "b"]);
  });

  it("a billed-zero meter beside a real one keeps a real (zero) share, NOT not-on-file", () => {
    // A meter that genuinely billed 0 kWh is on file (a real fact), distinct from a meter with no
    // usage on file (null). So it gets a real 0 share, the real meter gets 1, and it is NOT collected
    // as not-on-file. (Absence-vs-zero is the honest distinction the wedge rests on.)
    const result = allocateArray("arr-1", null, [m("a", 100), m("b", 0)]);
    expect(result.shares.find((s) => s.pumpId === "a")?.share).toBe(1);
    expect(result.shares.find((s) => s.pumpId === "b")?.share).toBe(0);
    expect(result.notOnFilePumpIds).toEqual([]);
  });

  it("ignores a negative or non-finite usage value as honest absence (never a guess)", () => {
    const result = allocateArray("arr-1", null, [
      m("a", 50),
      m("b", -10),
      m("c", Number.NaN),
      m("d", Number.POSITIVE_INFINITY),
    ]);
    expect(result.shares.find((s) => s.pumpId === "a")?.share).toBe(1);
    expect(result.notOnFilePumpIds.sort()).toEqual(["b", "c", "d"]);
  });

  it("computes proportional thirds within rounding", () => {
    const result = allocateArray("arr-1", null, [m("a", 1), m("b", 1), m("c", 1)]);
    for (const s of result.shares) expect(s.share).toBeCloseTo(1 / 3, 10);
    const sum = result.shares.reduce((acc, s) => acc + (s.share ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("ALLOCATION_TOLERANCE_PP", () => {
  it("is the single documented audit tolerance constant, in percentage points", () => {
    expect(ALLOCATION_TOLERANCE_PP).toBe(5);
  });
});

// C-3 (FR11, DM3): the array program-type classification. One benefiting meter is single-meter solar
// ("nem"); two or more is aggregation ("nema"); the explicit "vnem" token (forward-compatible, no
// launch instance in the Batth cohort) is VNEM, proven only by a synthetic input. A null/unrecognized
// token never fabricates "vnem" - it defers to the honest count (fail-closed).
describe("classifyProgramType", () => {
  it("classifies one benefiting meter as single-meter solar (nem)", () => {
    expect(classifyProgramType({ benefitingMeterCount: 1, nemType: "nem2" })).toBe("nem");
  });

  it("classifies two or more benefiting meters as aggregation (nema)", () => {
    expect(classifyProgramType({ benefitingMeterCount: 2, nemType: "nem2_agg" })).toBe("nema");
    expect(classifyProgramType({ benefitingMeterCount: 17, nemType: "nem2" })).toBe("nema");
  });

  it("classifies the explicit vnem token as vnem (synthetic input, no launch instance)", () => {
    // VNEM has no Batth-cohort instance, so it is proven only here with a synthetic nemType.
    expect(classifyProgramType({ benefitingMeterCount: 5, nemType: "vnem" })).toBe("vnem");
  });

  it("treats the vnem token as a tariff fact that wins over the meter count", () => {
    // A VNEM array with a single linked meter is still VNEM (the program type is a tariff fact, not
    // an inference from how many meters happen to be linked today).
    expect(classifyProgramType({ benefitingMeterCount: 1, nemType: "vnem" })).toBe("vnem");
  });

  it("matches the vnem token case-insensitively and trims surrounding whitespace", () => {
    expect(classifyProgramType({ benefitingMeterCount: 3, nemType: "VNEM" })).toBe("vnem");
    expect(classifyProgramType({ benefitingMeterCount: 3, nemType: "  vnem  " })).toBe("vnem");
  });

  it("never fabricates vnem from a null or unrecognized token (fail-closed to the count)", () => {
    // A null token defers to the honest count, never a guessed program.
    expect(classifyProgramType({ benefitingMeterCount: 1, nemType: null })).toBe("nem");
    expect(classifyProgramType({ benefitingMeterCount: 4, nemType: null })).toBe("nema");
    // A token that merely contains "vnem" as a substring (not the exact token) is not VNEM.
    expect(classifyProgramType({ benefitingMeterCount: 1, nemType: "vnem2" })).toBe("nem");
    expect(classifyProgramType({ benefitingMeterCount: 3, nemType: "not_a_program" })).toBe("nema");
  });

  it("treats a zero or negative meter count as honest single-meter solar, never aggregation", () => {
    expect(classifyProgramType({ benefitingMeterCount: 0, nemType: "nem2" })).toBe("nem");
    expect(classifyProgramType({ benefitingMeterCount: -1, nemType: "nem2" })).toBe("nem");
  });
});
