import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { maxDemandInWindow } from "@/lib/energy";
import { parseGreenButton, type ParsedUsagePoint } from "./parse";

function loadFixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/greenbutton/${name}`, import.meta.url)),
    "utf8",
  );
}

// The peak each cycle sets, derived the same way the importer does it: the
// highest 15-minute kW inside the summary's billing window.
function cyclePeaks(up: ParsedUsagePoint): number[] {
  return up.summaries.map(
    (s) => maxDemandInWindow(up.intervals, s.start, s.close)?.kw ?? 0,
  );
}

describe("parseGreenButton, multi-meter account", () => {
  const ups = parseGreenButton(loadFixture("sandhu-multi-meter.xml"));

  it("returns one entry per service ID, in document order", () => {
    expect(ups.map((u) => u.serviceId)).toEqual([
      "8590312001",
      "8590312002",
      "8590312003",
    ]);
  });

  it("parses Home Ranch Well: tariff, address, two cycles, scaled kWh (mult 0)", () => {
    const up = ups.find((u) => u.serviceId === "8590312001");
    expect(up).toBeDefined();
    if (!up) return;

    expect(up.tariff).toBe("AG-C");
    expect(up.address).toBe("16400 Avenue 12, Madera, CA 93637");
    expect(up.summaries).toHaveLength(2);
    expect(up.intervals).toHaveLength(10); // 6 (cycle A) + 4 (cycle B)

    // mult 0: <value> is Wh, so 28000 Wh -> 28 kWh in the interval.
    expect(up.intervals[0]?.start).toBe("2026-06-02T22:00:00.000Z");
    const peakInterval = up.intervals.find((r) => r.kWh === 28);
    expect(peakInterval?.start).toBe("2026-06-02T22:30:00.000Z");

    // The highest 15-minute kW per cycle (28 kWh / 0.25h = 112 kW; 34.5 -> 138).
    expect(cyclePeaks(up)).toEqual([112, 138]);
  });

  it("reads AG-C demand charges as max-demand + summer-peak, summed", () => {
    const up = ups.find((u) => u.serviceId === "8590312001");
    const cycleA = up?.summaries[0];
    expect(cycleA?.demandCharges).toEqual([
      { note: "Maximum Demand Charge", usd: 2016 },
      { note: "Summer Peak Demand Charge", usd: 1260 },
    ]);
    expect(cycleA?.demandChargeUsd).toBe(3276);
    expect(cycleA?.totalBillUsd).toBe(8540.5);

    expect(up?.summaries[1]?.demandChargeUsd).toBe(4209); // 2484 + 1725
  });

  it("parses North Well peaks and demand charges", () => {
    const up = ups.find((u) => u.serviceId === "8590312002");
    expect(up?.tariff).toBe("AG-C");
    expect(cyclePeaks(up!)).toEqual([96, 104]);
    expect(up?.summaries.map((s) => s.demandChargeUsd)).toEqual([2808, 3042]);
  });

  it("scales River Well with powerOfTenMultiplier 3 and reads AG-B (no summer peak)", () => {
    const up = ups.find((u) => u.serviceId === "8590312003");
    expect(up?.tariff).toBe("AG-B");
    // mult 3: <value> 18 -> 18 kWh -> 72 kW.
    const peakInterval = up?.intervals.find((r) => r.kWh === 18);
    expect(peakInterval).toBeDefined();
    expect(cyclePeaks(up!)).toEqual([72, 80]);
    // AG-B carries only the maximum demand charge.
    expect(up?.summaries[0]?.demandCharges).toEqual([
      { note: "Maximum Demand Charge", usd: 1224 },
    ]);
    expect(up?.summaries.map((s) => s.demandChargeUsd)).toEqual([1224, 1360]);
  });
});

describe("parseGreenButton, single meter", () => {
  const ups = parseGreenButton(loadFixture("single-meter.xml"));

  it("parses one service ID over two cycles, including the estimated reading", () => {
    expect(ups).toHaveLength(1);
    const up = ups[0];
    expect(up?.serviceId).toBe("8590312009");
    expect(up?.tariff).toBe("AG-B");
    expect(up?.address).toBe("14500 Road 26, Chowchilla, CA 93610");
    expect(up?.intervals).toHaveLength(6); // estimated reading is kept
    expect(cyclePeaks(up!)).toEqual([60, 68]);
    expect(up?.summaries.map((s) => s.demandChargeUsd)).toEqual([1020, 1156]);
  });
});

describe("parseGreenButton, unsupported unit of measure", () => {
  it("throws when a ReadingType uses a uom we do not model", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:espi="http://naesb.org/espi">
        <entry>
          <link rel="self" href="/resource/UsagePoint/1/MeterReading/01/ReadingType/01"/>
          <content><espi:ReadingType><espi:uom>38</espi:uom><espi:powerOfTenMultiplier>0</espi:powerOfTenMultiplier></espi:ReadingType></content>
        </entry>
        <entry>
          <link rel="self" href="/resource/UsagePoint/1/MeterReading/01/IntervalBlock/01"/>
          <content><espi:IntervalBlock>
            <espi:IntervalReading><espi:timePeriod><espi:duration>900</espi:duration><espi:start>1780437600</espi:start></espi:timePeriod><espi:value>100</espi:value></espi:IntervalReading>
          </espi:IntervalBlock></content>
        </entry>
      </feed>`;
    expect(() => parseGreenButton(xml)).toThrow(/uom 38/);
  });
});
