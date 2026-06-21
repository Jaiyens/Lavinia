import { describe, expect, it } from "vitest";
import {
  buildGroups,
  inferGroupFromCoords,
  inferGroupFromName,
  resolveGroupName,
} from "./group";
import type { MeterSnapshot } from "./types";

function meter(over: Partial<MeterSnapshot>): MeterSnapshot {
  return {
    id: "m1",
    name: "Avenue 7 Pump 3",
    kind: "pump",
    group: null,
    lat: null,
    lng: null,
    rateSchedule: "AG-A1",
    dollarsPerKw: 19.71,
    peakSoFarKw: 150,
    currentKw: 100,
    currentAsOf: "2026-06-19T18:00:00.000Z",
    peakAtMinute: 900,
    loadFactor: 0.35,
    seed: "m1",
    cycleStartIso: "2026-06-01",
    cycleCloseIso: "2026-06-30",
    ...over,
  };
}

describe("inferGroupFromName", () => {
  it("strips a trailing unit token", () => {
    expect(inferGroupFromName("Avenue 7 Pump 3")).toBe("Avenue 7");
    expect(inferGroupFromName("Westside Well 1")).toBe("Westside");
    expect(inferGroupFromName("Lateral 3 Booster")).toBe("Lateral 3");
  });
  it("leaves a bare non-structured name ungrouped", () => {
    expect(inferGroupFromName("Shop")).toBeNull();
    expect(inferGroupFromName("Pump")).toBeNull();
    expect(inferGroupFromName("")).toBeNull();
  });
});

describe("inferGroupFromCoords", () => {
  it("buckets nearby coords into the same cell", () => {
    const a = inferGroupFromCoords(36.741, -119.788);
    const b = inferGroupFromCoords(36.7409, -119.7881);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
  it("returns null without coords", () => {
    expect(inferGroupFromCoords(null, null)).toBeNull();
  });
});

describe("resolveGroupName precedence", () => {
  it("manual override beats everything", () => {
    const m = meter({ id: "x", name: "Avenue 7 Pump 3", group: "Source Block" });
    expect(resolveGroupName(m, { x: "My Block" })).toBe("My Block");
  });
  it("explicit source field beats name inference", () => {
    const m = meter({ name: "Avenue 7 Pump 3", group: "Home Ranch" });
    expect(resolveGroupName(m, {})).toBe("Home Ranch");
  });
  it("falls back to the inferred name group", () => {
    expect(resolveGroupName(meter({}), {})).toBe("Avenue 7");
  });
  it("falls back to coords, then ungrouped", () => {
    const geo = meter({ name: "Shop", group: null, lat: 36.75, lng: -119.8 });
    expect(resolveGroupName(geo, {})).toContain("Block");
    const none = meter({ name: "Shop", group: null, lat: null, lng: null });
    expect(resolveGroupName(none, {})).toBe("Ungrouped");
  });
});

describe("buildGroups", () => {
  const meters = [
    meter({ id: "a1", name: "Avenue 7 Pump 1", peakSoFarKw: 168, currentKw: 90 }),
    meter({ id: "a3", name: "Avenue 7 Pump 3", peakSoFarKw: 150, currentKw: 145 }), // danger
    meter({ id: "w1", name: "Westside Well 1", peakSoFarKw: 210, currentKw: 100 }),
  ];

  it("groups by inferred block and never exposes a group kW", () => {
    const groups = buildGroups(meters, {});
    const av7 = groups.find((g) => g.name === "Avenue 7");
    expect(av7).toBeDefined();
    expect(av7?.risks).toHaveLength(2);
    // The group object's keys: no kW / distance-to-peak field exists by construction.
    expect(Object.keys(av7 ?? {})).not.toContain("peakKw");
    expect(Object.keys(av7 ?? {})).not.toContain("currentKw");
    expect(Object.keys(av7 ?? {})).not.toContain("headroomKw");
  });

  it("group indicator is the WORST meter and the at-risk count is honest", () => {
    const groups = buildGroups(meters, {});
    const av7 = groups.find((g) => g.name === "Avenue 7");
    expect(av7?.worst).toBe("danger");
    expect(av7?.atRiskCount).toBe(1);
  });

  it("rolls up DOLLARS (a sum of per-meter charges), and sorts worst-first", () => {
    const groups = buildGroups(meters, {});
    expect(groups[0]?.name).toBe("Avenue 7"); // danger floats to the top
    const av7 = groups.find((g) => g.name === "Avenue 7");
    expect(av7?.totalLockedDemandUsd).toBeGreaterThan(0);
  });

  it("manual corrections survive: a re-run with the same override re-slots the meter", () => {
    const overrides = { a3: "Westside" };
    const groups = buildGroups(meters, overrides);
    const westside = groups.find((g) => g.name === "Westside");
    expect(westside?.risks.map((r) => r.meter.id).sort()).toEqual(["a3", "w1"]);
    const av7 = groups.find((g) => g.name === "Avenue 7");
    expect(av7?.risks.map((r) => r.meter.id)).toEqual(["a1"]);
  });
});
