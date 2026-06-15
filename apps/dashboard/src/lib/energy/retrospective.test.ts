import { describe, expect, it } from "vitest";
import { retrospective, type RetrospectiveInput } from "./retrospective";
import type { CycleBill, IntervalReading } from "./types";

const TZ = "America/Los_Angeles";

// 15-minute reading helper; kW = kWh * 4. Times sit at midday UTC so the local
// (PDT) calendar day matches the UTC date, keeping the day-grouping obvious.
function r(date: string, kWh: number): IntervalReading {
  return { start: `${date}T19:00:00.000Z`, durationSec: 900, kWh };
}

// May cycle: one clear spike day (May 20 at 150 kW) far above the rest of the
// month (~100 kW). June cycle: flat, no outlier. April cycle: no demand charge.
const INTERVALS: IntervalReading[] = [
  r("2026-05-20", 37.5), // 150 kW  <- the spike that set the charge
  r("2026-05-21", 25), //   100 kW
  r("2026-05-22", 24), //    96 kW
  r("2026-06-20", 25), //   100 kW (flat month)
  r("2026-06-21", 24.5), //  98 kW
];

const BILLS: CycleBill[] = [
  {
    start: "2026-05-15T00:00:00.000Z",
    close: "2026-06-12T00:00:00.000Z",
    tariff: "AG-C",
    demandChargeUsd: 1200, // / 150 kW peak = $8/kW
    peakKw: 150,
  },
  {
    start: "2026-06-13T00:00:00.000Z",
    close: "2026-07-15T00:00:00.000Z",
    tariff: "AG-C",
    demandChargeUsd: 900,
    peakKw: 100,
  },
  {
    start: "2026-04-15T00:00:00.000Z",
    close: "2026-05-14T00:00:00.000Z",
    tariff: "AG-C",
    demandChargeUsd: 0, // never hit a demand charge
    peakKw: 40,
  },
];

const INPUT: RetrospectiveInput = {
  farmId: "farm1",
  pumpId: "pump1",
  pumpName: "East well",
  timezone: TZ,
  intervals: INTERVALS,
  bills: BILLS,
  asOf: "2026-08-01",
};

describe("retrospective", () => {
  it("emits one rec per cycle that hit a demand charge, skipping the $0 cycle", () => {
    const recs = retrospective(INPUT);
    expect(recs).toHaveLength(2);
    expect(recs.every((rec) => rec.tool === "pump-timing")).toBe(true);
    expect(recs.every((rec) => rec.severity === "info")).toBe(true);
    expect(recs.every((rec) => rec.status === "pending")).toBe(true);
    expect(recs.every((rec) => rec.createdAt === "2026-08-01")).toBe(true);
  });

  it("prices the avoidable spike day against the bill's own $/kW", () => {
    const [may] = retrospective(INPUT);
    if (!may) throw new Error("expected the May rec");

    // 150 kW spike over the 100 kW the rest of the month = 50 kW avoidable,
    // at $1,200 / 150 kW = $8/kW => $400.
    expect(may.impactUsd).toBe(400);
    expect(may.situation).toBe(
      "Last May this pump's bill had a demand charge of $1,200.",
    );
    expect(may.impactNote).toContain("May 20");
    expect(may.impactNote).toContain("$400");
    expect(may.action.kind).toBe("review_peak");
    expect(may.action.label).toBe("See the May 20 spike");
    expect(may.action.params).toEqual({
      pumpId: "pump1",
      cycleStart: "2026-05-15T00:00:00.000Z",
      cycleClose: "2026-06-12T00:00:00.000Z",
      demandChargeUsd: 1200,
      peakKw: 150,
      ratePerKw: 8,
      peakDay: "2026-05-20",
      avoidableKw: 50,
      dailyPeaks: [
        { date: "2026-05-20", kw: 150, at: "2026-05-20T19:00:00.000Z" },
        { date: "2026-05-21", kw: 100, at: "2026-05-21T19:00:00.000Z" },
        { date: "2026-05-22", kw: 96, at: "2026-05-22T19:00:00.000Z" },
      ],
    });
  });

  it("flags a flat month as informational with no avoidable dollars", () => {
    const recs = retrospective(INPUT);
    const june = recs[1];
    if (!june) throw new Error("expected the June rec");

    expect(june.impactUsd).toBeUndefined();
    expect(june.impactNote).toBeUndefined();
    expect(june.situation).toBe(
      "Last June this pump's bill had a demand charge of $900.",
    );
    expect(june.action.params?.peakDay).toBeNull();
    expect(june.action.params?.avoidableKw).toBeNull();
  });

  it("respects a custom outlier margin (a smaller gap still counts)", () => {
    // June's 100 vs 98 is a ~2% gap; a 1% margin makes it an outlier.
    const recs = retrospective({ ...INPUT, outlierMargin: 0.01 });
    const june = recs[1];
    if (!june) throw new Error("expected the June rec");
    expect(june.impactUsd).toBeCloseTo(2 * (900 / 100), 5); // 2 kW * $9/kW = $18
  });

  it("returns nothing for a pump with no posted bills", () => {
    expect(retrospective({ ...INPUT, bills: [] })).toEqual([]);
  });
});
