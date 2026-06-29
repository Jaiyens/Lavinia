import { describe, expect, it } from "vitest";
import {
  cashSummary,
  collectedCents,
  commitmentCash,
  expectedCents,
  outstandingCents,
} from "./collection";
import { liveRows } from "./supersede";
import type { CommitmentEntry, CommitmentStatus } from "./types";

// Pure tests for the commitment ledger's cash math (WS2b): expected / collected / outstanding are
// integer-exact cents; the production -> sale -> COLLECTION lifecycle advances by SUPERSEDE so only
// the live row counts; honest negatives are never clamped.

function commit(
  id: string,
  pounds: number,
  priceCentsPerPound: number | null,
  extra: Partial<CommitmentEntry> = {},
): CommitmentEntry {
  return {
    id,
    cropYear: 2026,
    variety: "Nonpareil",
    pounds,
    buyer: "Packer Co",
    source: "ALMOND_LOGIC",
    supersedesId: null,
    status: "committed",
    priceCentsPerPound,
    settledPriceCentsPerPound: null,
    collectedCents: null,
    collectedAt: null,
    ...extra,
  };
}

describe("collection cash math", () => {
  it("expected = pounds * price, integer cents exact", () => {
    // 150,000 lb at 235 cents/lb = 35,250,000 cents ($352,500).
    expect(expectedCents(commit("c1", 150_000, 235))).toBe(35_250_000);
  });

  it("expected is null when the contract is pounds-only (no price)", () => {
    expect(expectedCents(commit("c1", 150_000, null))).toBeNull();
  });

  it("collected defaults to 0 cents until cash is recorded", () => {
    expect(collectedCents(commit("c1", 150_000, 235))).toBe(0);
    expect(collectedCents(commit("c1", 150_000, 235, { collectedCents: 10_000_000 }))).toBe(10_000_000);
  });

  it("outstanding = expected - collected (integer-exact)", () => {
    const c = commit("c1", 150_000, 235, { collectedCents: 10_000_000 });
    expect(outstandingCents(c)).toBe(35_250_000 - 10_000_000); // 25,250,000
  });

  it("outstanding is null when there is no price (nothing honest to owe)", () => {
    expect(outstandingCents(commit("c1", 150_000, null, { collectedCents: 500 }))).toBeNull();
  });

  it("outstanding honors negatives (overpaid), never clamped", () => {
    const c = commit("c1", 100_000, 200, { collectedCents: 25_000_000 }); // expected 20,000,000
    expect(outstandingCents(c)).toBe(-5_000_000);
  });

  it("commitmentCash bundles all three figures", () => {
    const c = commit("c1", 100_000, 200, { collectedCents: 5_000_000 });
    expect(commitmentCash(c)).toEqual({
      expectedCents: 20_000_000,
      collectedCents: 5_000_000,
      outstandingCents: 15_000_000,
    });
  });
});

describe("cashSummary across live commitments", () => {
  it("totals committed / collected / outstanding over live rows, integer-exact", () => {
    const commitments: CommitmentEntry[] = [
      commit("a", 100_000, 200, { collectedCents: 5_000_000 }), // expected 20M, out 15M
      commit("b", 50_000, 300, { collectedCents: 0 }), // expected 15M, out 15M
    ];
    expect(cashSummary(commitments)).toEqual({
      committedCents: 35_000_000,
      collectedCents: 5_000_000,
      outstandingCents: 30_000_000,
    });
  });

  it("a pounds-only commitment adds nothing to committed/outstanding but counts its collected", () => {
    const commitments: CommitmentEntry[] = [
      commit("a", 100_000, 200, { collectedCents: 1_000_000 }), // expected 20M, out 19M
      commit("b", 50_000, null, { collectedCents: 2_000_000 }), // no price -> only collected counts
    ];
    expect(cashSummary(commitments)).toEqual({
      committedCents: 20_000_000,
      collectedCents: 3_000_000,
      outstandingCents: 19_000_000,
    });
  });

  it("committed -> settled -> collected supersede keeps ONLY the live row (liveRows)", () => {
    // The lifecycle: a committed row, superseded by a settled row, superseded by a collected row.
    const committed = commit("committed", 100_000, 200, { status: "committed" });
    const settled = commit("settled", 100_000, 235, {
      status: "settled",
      source: "PACKER_SETTLED",
      settledPriceCentsPerPound: 235,
      supersedesId: "committed",
    });
    const collected = commit("collected", 100_000, 235, {
      status: "collected",
      source: "PACKER_SETTLED",
      settledPriceCentsPerPound: 235,
      collectedCents: 23_500_000,
      collectedAt: "2026-06-28T00:00:00.000Z",
      supersedesId: "settled",
    });
    const chain: CommitmentEntry[] = [committed, settled, collected];

    // Only the collected row survives the supersede chain.
    const live = liveRows(chain);
    expect(live).toHaveLength(1);
    const liveRow = live[0] as CommitmentEntry;
    expect(liveRow.id).toBe("collected");
    expect(liveRow.status satisfies CommitmentStatus).toBe("collected");

    // The summary counts the live (collected) row once: expected 100,000 * 235 = 23,500,000,
    // collected 23,500,000, outstanding 0 — NOT triple-counted across the chain.
    expect(cashSummary(chain)).toEqual({
      committedCents: 23_500_000,
      collectedCents: 23_500_000,
      outstandingCents: 0,
    });
  });
});
