import { describe, expect, it } from "vitest";
import { backTestTolerance } from "./back-test-config";
import type { CycleExclusion, MeterBackTest } from "./rate-lever";
import {
  buildReconciliationRecord,
  inferCause,
  RATE_CHANGE_BOUNDARY_ISO,
  type ReconciliationRecord,
} from "./back-test-report";

// Hand-built MeterBackTest fixtures so every expectation is computable by hand,
// with no DB and no rate card on disk: the cause logic is a pure transform of the
// already-computed back-test numbers.
type CycleSpec = { printed: number; recomputed: number; start: string; close: string };

function backTest(cycles: CycleSpec[]): MeterBackTest {
  const perCycle = cycles.map((c) => ({
    start: c.start,
    close: c.close,
    printedTotalCents: c.printed,
    recomputedTotalCents: c.recomputed,
    deviationPct:
      c.printed > 0 ? ((c.recomputed - c.printed) / c.printed) * 100 : Number.POSITIVE_INFINITY,
  }));
  const sumPrinted = perCycle.reduce((s, c) => s + c.printedTotalCents, 0);
  const sumRecomputed = perCycle.reduce((s, c) => s + c.recomputedTotalCents, 0);
  const sumAbsError = perCycle.reduce(
    (s, c) => s + Math.abs(c.recomputedTotalCents - c.printedTotalCents),
    0,
  );
  return {
    testedCycles: perCycle.length,
    sumPrintedCents: sumPrinted,
    sumRecomputedCents: sumRecomputed,
    sumAbsErrorCents: sumAbsError,
    aggregateDeviationPct:
      perCycle.length > 0 && sumPrinted > 0 ? (sumAbsError / sumPrinted) * 100 : null,
    perCycle,
  };
}

const TOL = backTestTolerance(); // { bandPct: 3, perCycleBandPct: 6, minSavingsCents: 100 }

function record(
  cycles: CycleSpec[],
  opts: {
    excluded?: CycleExclusion[];
    testedKwh?: number;
    cardEffectiveDate?: string;
  } = {},
): ReconciliationRecord {
  return buildReconciliationRecord({
    meter: { id: "m1", name: "Pump 1", serviceId: "SA-1", rateSchedule: "AG-C" },
    backTest: backTest(cycles),
    excluded: opts.excluded ?? [],
    testedKwh: opts.testedKwh ?? 5000,
    cardVersion: "2026-06.2",
    cardEffectiveDate: opts.cardEffectiveDate ?? "2026-01-01",
    tolerance: TOL,
  });
}

describe("buildReconciliationRecord", () => {
  it("passes and reports cause 'unknown' when the recompute lands within band", () => {
    // +2% on one cycle: aggregate 2% <= 3% and per-cycle 2% <= 6%.
    const r = record([
      { printed: 10_000, recomputed: 10_200, start: "2026-06-01", close: "2026-06-30" },
    ]);
    expect(r.pass).toBe(true);
    expect(r.cause).toBe("unknown");
    expect(r.computedCents).toBe(10_200);
    expect(r.realCents).toBe(10_000);
    expect(r.absErrorCents).toBe(200);
    expect(r.pctError).toBeCloseTo(2, 6);
    expect(r.perCycle[0]?.withinBand).toBe(true);
    expect(r.billDates).toEqual([{ start: "2026-06-01", close: "2026-06-30" }]);
  });

  it("fails when the aggregate error exceeds the band", () => {
    const r = record([
      { printed: 10_000, recomputed: 10_800, start: "2026-06-01", close: "2026-06-30" },
    ]);
    expect(r.pass).toBe(false);
    expect(r.pctError).toBeCloseTo(8, 6);
  });

  it("fails when one cycle breaks the per-cycle band even if the aggregate squeaks in", () => {
    // Two cycles: one +0.2%, one +7% (over the 6% per-cycle band). The aggregate
    // is well under band (~0.8%), so the per-cycle breach alone must sink it.
    const r = record([
      { printed: 100_000, recomputed: 100_200, start: "2026-06-01", close: "2026-06-30" },
      { printed: 10_000, recomputed: 10_700, start: "2026-07-01", close: "2026-07-31" },
    ]);
    expect(r.perCycle[1]?.withinBand).toBe(false);
    expect(r.pass).toBe(false);
  });

  it("is not testable (pass false, pctError null) when no cycle was tested", () => {
    const excluded: CycleExclusion[] = [
      { start: "2026-06-01", close: "2026-06-30", reason: "no_printed_total" },
    ];
    const r = buildReconciliationRecord({
      meter: { id: "m1", name: "Pump 1", serviceId: "SA-1", rateSchedule: "AG-C" },
      backTest: backTest([]),
      excluded,
      testedKwh: 0,
      cardVersion: "2026-06.2",
      cardEffectiveDate: "2026-01-01",
      tolerance: TOL,
    });
    expect(r.pass).toBe(false);
    expect(r.pctError).toBeNull();
    expect(r.cause).toBe("partial_bill");
  });
});

describe("inferCause", () => {
  it("flags rate_change_straddle when a tested cycle spans the 2026-03-01 change", () => {
    const r = record(
      [{ printed: 10_000, recomputed: 10_800, start: "2026-02-15", close: "2026-03-15" }],
      { cardEffectiveDate: "2026-01-01" },
    );
    expect(r.pass).toBe(false);
    expect(r.cause).toBe("rate_change_straddle");
    // sanity: the boundary the module uses is the documented one.
    expect(RATE_CHANGE_BOUNDARY_ISO).toBe("2026-03-01");
  });

  it("flags stale_rate_card when a cycle predates the card effective date", () => {
    const r = record(
      [{ printed: 10_000, recomputed: 10_900, start: "2026-01-15", close: "2026-02-14" }],
      { cardEffectiveDate: "2026-03-01" },
    );
    expect(r.pass).toBe(false);
    expect(r.cause).toBe("stale_rate_card");
  });

  it("flags partial_bill when exclusions outnumber tested cycles", () => {
    const excluded: CycleExclusion[] = [
      { start: "2026-04-01", close: "2026-04-30", reason: "credit_cycle" },
      { start: "2026-05-01", close: "2026-05-31", reason: "zero_total" },
    ];
    const r = record(
      [{ printed: 10_000, recomputed: 10_900, start: "2026-06-01", close: "2026-06-30" }],
      { excluded, cardEffectiveDate: "2026-01-01" },
    );
    expect(r.cause).toBe("partial_bill");
  });

  it("flags incomplete_intervals when priced cycles carry no usage basis", () => {
    const r = record(
      [{ printed: 10_000, recomputed: 10_900, start: "2026-06-01", close: "2026-06-30" }],
      { testedKwh: 0, cardEffectiveDate: "2026-01-01" },
    );
    expect(r.cause).toBe("incomplete_intervals");
  });

  it("flags ocr_noise for small mixed-sign scatter with no systematic cause", () => {
    // +4% and -4%: aggregate 4% fails the 3% band, but each is within the 6%
    // per-cycle band and the signs are mixed -> extraction noise.
    const r = record(
      [
        { printed: 10_000, recomputed: 10_400, start: "2026-06-01", close: "2026-06-30" },
        { printed: 10_000, recomputed: 9_600, start: "2026-07-01", close: "2026-07-31" },
      ],
      { cardEffectiveDate: "2026-01-01" },
    );
    expect(r.pass).toBe(false);
    expect(r.cause).toBe("ocr_noise");
  });

  it("falls back to unknown for a same-sign systematic miss within the per-cycle band", () => {
    // Both +4%: aggregate 4% fails, each within 6%, but not mixed-sign -> unknown.
    const r = record(
      [
        { printed: 10_000, recomputed: 10_400, start: "2026-06-01", close: "2026-06-30" },
        { printed: 10_000, recomputed: 10_400, start: "2026-07-01", close: "2026-07-31" },
      ],
      { cardEffectiveDate: "2026-01-01" },
    );
    expect(r.pass).toBe(false);
    expect(r.cause).toBe("unknown");
  });

  it("inferCause is callable directly on a record shape (priority: straddle wins over stale)", () => {
    const r = record(
      [{ printed: 10_000, recomputed: 10_800, start: "2026-02-15", close: "2026-03-15" }],
      { cardEffectiveDate: "2026-03-01" }, // cycle also predates effective, but straddle has priority
    );
    const { cause: _omit, ...base } = r;
    void _omit;
    expect(
      inferCause(base, {
        cardVersion: "2026-06.2",
        cardEffectiveDate: "2026-03-01",
        rateChangeBoundaryIso: RATE_CHANGE_BOUNDARY_ISO,
        excluded: [],
        testedKwh: 5000,
        tolerance: TOL,
      }),
    ).toBe("rate_change_straddle");
  });
});
