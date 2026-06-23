import { describe, expect, it } from "vitest";
import { buildBoardSummary } from "./board";
import { representativeFeed } from "./generate";
import { meterDayCurve } from "./curve";

const NOW = new Date("2026-06-20T20:00:00.000Z");

describe("representative feed", () => {
  it("renders a multi-group dataset with at least one meter near its ceiling", () => {
    const feed = representativeFeed(NOW).load();
    expect(feed.representative).toBe(true);
    expect(feed.meters.length).toBeGreaterThanOrEqual(8);
    // The asOf stamp lags now (never live).
    expect(new Date(feed.asOf).getTime()).toBeLessThan(NOW.getTime());
    // Every current read carries its own past timestamp.
    for (const m of feed.meters) {
      expect(new Date(m.currentAsOf).getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it("includes a meter hugging its ceiling AND one setting a new peak", () => {
    const summary = buildBoardSummary(representativeFeed(NOW).load(), NOW);
    expect(summary.atRiskCount).toBeGreaterThan(0);
    expect(summary.settingNewPeakCount).toBeGreaterThan(0);
    expect(summary.worst).toBe("danger");
    expect(summary.urgent).not.toBeNull();
  });

  it("meterDayCurve's max equals the meter's peak-so-far ceiling (reconciles)", () => {
    const m = representativeFeed(NOW).load().meters[0];
    if (m === undefined) throw new Error("no meter");
    const { points } = meterDayCurve(m);
    const max = Math.max(...points.map((p) => p.kw));
    expect(max).toBeCloseTo(m.peakSoFarKw, 6);
  });
});

describe("buildBoardSummary", () => {
  it("produces dollar roll-ups headed up from the locked total, and a read", () => {
    const summary = buildBoardSummary(representativeFeed(NOW).load(), NOW, "hot");
    expect(summary.cycleDemandLockedUsd).toBeGreaterThan(0);
    expect(summary.cycleDemandHeadedUsd).toBeGreaterThanOrEqual(summary.cycleDemandLockedUsd);
    expect(["high", "moderate", "low"]).toContain(summary.read.level);
    expect(summary.asOfPhrase.length).toBeGreaterThan(0);
  });

  it("the summary exposes no farm-wide kW, only dollars + counts", () => {
    const summary = buildBoardSummary(representativeFeed(NOW).load(), NOW);
    const keys = Object.keys(summary);
    expect(keys).not.toContain("farmKw");
    expect(keys).not.toContain("distanceToPeakKw");
  });
});
