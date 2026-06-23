import { describe, expect, it } from "vitest";
import { loadRateCard } from "@/lib/pge/rate-card";
import { matchIncentives, INCENTIVE_TOOL, type IncentiveMeter } from "./match";

// The matcher is pure: meters + card in, honest-blank drafts out. These pin the emitted
// shape (tool 'rebate', severity 'watch', NO dollar, execute null), the dr.ts de-dupe (a meter
// whose bill already prints a DR enrollment never gets the matching curtailment program), and
// the AG-C / solar gates flowing through from the catalog.

const card = loadRateCard();
const asOf = "2026-06-09T12:00:00.000Z";

function meter(over: Partial<IncentiveMeter> = {}): IncentiveMeter {
  return {
    id: "m1",
    name: "P031",
    scheduleLabel: "AGC Ag35+ kW High Use",
    isSolar: false,
    lineItems: [],
    ...over,
  };
}

describe("matchIncentives - emitted grammar", () => {
  it("emits honest-blank drafts: tool 'rebate', severity 'watch', no impactUsd, execute null", () => {
    const drafts = matchIncentives({ farmId: "f1", meters: [meter()], card, asOf });
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(d.tool).toBe(INCENTIVE_TOOL);
      expect(d.tool).toBe("rebate");
      expect(d.severity).toBe("watch");
      expect(d.impactUsd).toBeUndefined(); // never a dollar
      expect(d.status).toBe("pending");
      expect(d.createdAt).toBe(asOf);
      expect(d.farmId).toBe("f1");
      expect(typeof d.impactNote).toBe("string");
      expect(d.impactNote).not.toMatch(/\$\s*\d/); // no dollar figure in the note
      const action = d.action as {
        kind: string;
        params?: { pumpId?: string; programId?: string };
        execute?: unknown;
      };
      expect(action.kind).toBe("review_incentive");
      expect(action.execute).toBeNull();
      expect(action.params?.pumpId).toBe("m1");
      expect(typeof action.params?.programId).toBe("string");
    }
  });

  it("matches the three demand programs for a bare AG-C meter (no solar, no DR print)", () => {
    const drafts = matchIncentives({ farmId: "f1", meters: [meter()], card, asOf });
    const programIds = drafts.map(
      (d) => (d.action.params as { programId?: string } | undefined)?.programId,
    );
    expect(programIds).toEqual(["pge-pdp", "pge-cbp", "pge-bip"]);
  });
});

describe("matchIncentives - de-dupe against the existing DR finding (dr.ts)", () => {
  it("suppresses ONLY the printed program, leaving the sibling curtailment programs", () => {
    const enrolled = meter({
      lineItems: [{ label: "PDP Event Day Credit 06/12" }],
    });
    const drafts = matchIncentives({ farmId: "f1", meters: [enrolled], card, asOf });
    const programIds = drafts.map(
      (d) => (d.action.params as { programId?: string } | undefined)?.programId,
    );
    // The dr.ts finding owns the printed PDP enrollment; CBP and BIP are still candidates.
    expect(programIds).toEqual(["pge-cbp", "pge-bip"]);
  });

  it("surfaces SGIP plus the non-printed curtailment programs for a solar AG-C meter", () => {
    const solarEnrolled = meter({
      isSolar: true,
      lineItems: [{ label: "BIP Incentive" }],
    });
    const drafts = matchIncentives({ farmId: "f1", meters: [solarEnrolled], card, asOf });
    const programIds = drafts.map(
      (d) => (d.action.params as { programId?: string } | undefined)?.programId,
    );
    // BIP printed -> suppressed; PDP + CBP still candidates; SGIP from solar.
    expect(programIds).toEqual(["pge-pdp", "pge-cbp", "ca-sgip"]);
  });
});

describe("matchIncentives - gates and ordering", () => {
  it("matches SGIP only for a solar meter", () => {
    const solar = meter({ isSolar: true, scheduleLabel: "AGA1 Ag<35 kW Low Use" });
    const drafts = matchIncentives({ farmId: "f1", meters: [solar], card, asOf });
    const programIds = drafts.map(
      (d) => (d.action.params as { programId?: string } | undefined)?.programId,
    );
    expect(programIds).toEqual(["ca-sgip"]);
  });

  it("emits nothing for a non-AG-C, non-solar meter", () => {
    const aga = meter({ scheduleLabel: "AGA1 Ag<35 kW Low Use" });
    expect(matchIncentives({ farmId: "f1", meters: [aga], card, asOf })).toHaveLength(0);
  });

  it("is deterministic in meter order then catalog order", () => {
    const a = meter({ id: "mA", name: "P010", isSolar: true });
    const b = meter({ id: "mB", name: "P020" });
    const drafts = matchIncentives({ farmId: "f1", meters: [a, b], card, asOf });
    const pairs = drafts.map((d) => {
      const p = d.action.params as { pumpId?: string; programId?: string } | undefined;
      return `${p?.pumpId}:${p?.programId}`;
    });
    // P010 is AG-C + solar -> three curtailment + SGIP; P020 is AG-C only -> three curtailment.
    expect(pairs).toEqual([
      "mA:pge-pdp",
      "mA:pge-cbp",
      "mA:pge-bip",
      "mA:ca-sgip",
      "mB:pge-pdp",
      "mB:pge-cbp",
      "mB:pge-bip",
    ]);
  });
});
