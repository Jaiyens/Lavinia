import { describe, expect, it } from "vitest";
import { loadRateCard } from "@/lib/pge/rate-card";
import {
  INCENTIVE_CATALOG,
  type IncentiveContext,
  type IncentiveMeterFacts,
} from "./catalog";

// The catalog is a pure, static table of deterministic eligibility predicates. These tests
// pin: stable ids, the AG-C demand-metered gate (reused planFromLabel), the not-already-
// enrolled DR de-dupe, and the solar gate for the storage note. No clock, no IO, no dollars.

const ctx: IncentiveContext = { card: loadRateCard() };

function facts(over: Partial<IncentiveMeterFacts> = {}): IncentiveMeterFacts {
  return {
    scheduleLabel: "AGC Ag35+ kW High Use",
    isSolar: false,
    enrolledDrProgram: null,
    ...over,
  };
}

function program(id: string) {
  const p = INCENTIVE_CATALOG.find((x) => x.id === id);
  if (!p) throw new Error(`no catalog program ${id}`);
  return p;
}

describe("INCENTIVE_CATALOG shape", () => {
  it("ships a small set of stable, unique program ids and names", () => {
    expect(INCENTIVE_CATALOG.length).toBeGreaterThanOrEqual(3);
    expect(INCENTIVE_CATALOG.length).toBeLessThanOrEqual(8);
    const ids = INCENTIVE_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("pge-pdp");
    expect(ids).toContain("pge-cbp");
    expect(ids).toContain("pge-bip");
    expect(ids).toContain("ca-sgip");
    for (const p of INCENTIVE_CATALOG) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.name).not.toContain("—"); // no em dash in copy
    }
  });
});

describe("demand-metered (AG-C) curtailment programs", () => {
  it("match an AG-C meter not already on a DR program", () => {
    expect(program("pge-pdp").eligible(facts(), ctx)).toBe(true);
    expect(program("pge-cbp").eligible(facts(), ctx)).toBe(true);
    expect(program("pge-bip").eligible(facts(), ctx)).toBe(true);
  });

  it("do NOT match a non-demand (AG-A) family", () => {
    const aga = facts({ scheduleLabel: "AGA1 Ag<35 kW Low Use" });
    expect(program("pge-pdp").eligible(aga, ctx)).toBe(false);
    expect(program("pge-cbp").eligible(aga, ctx)).toBe(false);
    expect(program("pge-bip").eligible(aga, ctx)).toBe(false);
  });

  it("do NOT match when the schedule is unknown or absent (never a guess)", () => {
    expect(program("pge-pdp").eligible(facts({ scheduleLabel: null }), ctx)).toBe(false);
    expect(program("pge-pdp").eligible(facts({ scheduleLabel: "B1 General" }), ctx)).toBe(false);
  });

  it("are de-duped PER-PROGRAM against the enrollment the bill already prints (dr.ts overlap)", () => {
    // Only the matching row is suppressed (the exact case dr.ts already routes).
    expect(program("pge-pdp").eligible(facts({ enrolledDrProgram: "pdp" }), ctx)).toBe(false);
    expect(program("pge-cbp").eligible(facts({ enrolledDrProgram: "cbp" }), ctx)).toBe(false);
    expect(program("pge-bip").eligible(facts({ enrolledDrProgram: "bip" }), ctx)).toBe(false);
    // A sibling curtailment program is still a candidate when a DIFFERENT one is printed:
    // a grower already on PDP can still qualify for CBP / BIP.
    expect(program("pge-cbp").eligible(facts({ enrolledDrProgram: "pdp" }), ctx)).toBe(true);
    expect(program("pge-bip").eligible(facts({ enrolledDrProgram: "pdp" }), ctx)).toBe(true);
    expect(program("pge-pdp").eligible(facts({ enrolledDrProgram: "bip" }), ctx)).toBe(true);
  });
});

describe("SGIP storage note", () => {
  it("matches a solar meter only", () => {
    expect(program("ca-sgip").eligible(facts({ isSolar: true }), ctx)).toBe(true);
    expect(program("ca-sgip").eligible(facts({ isSolar: false }), ctx)).toBe(false);
  });

  it("does not depend on the DR enrollment or schedule family", () => {
    expect(
      program("ca-sgip").eligible(
        facts({ isSolar: true, scheduleLabel: "AGA1 Ag<35 kW Low Use", enrolledDrProgram: "pdp" }),
        ctx,
      ),
    ).toBe(true);
  });
});
