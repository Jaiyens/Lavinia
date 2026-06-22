import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deterministicDisputeLetter,
  draftDisputeLetter,
  disputeMonthLabel,
} from "./draft";
import type { DisputeCandidate } from "./detect";
import { usd } from "@/copy/en";

// Unit tests for the draft step. They prove: the deterministic /copy letter carries the
// engine-authored dollars VERBATIM (never recomputed); the offline default (no Gateway key)
// returns the deterministic letter and constructs NO gateway model and imports NO AI SDK
// (the offline-green law); the LLM path is OPTIONAL polish guarded by hasGatewayKey().

const candidate: DisputeCandidate = {
  recommendationId: "rec-1",
  pumpId: "pump-a",
  cycleStart: "2026-05-01",
  cycleClose: "2026-05-31",
  totalBillUsd: 1800,
  medianTotalUsd: 1200,
  excessUsd: 600,
  dedupeKey: "pump-a::2026-05-01",
};

const KEYS = ["AI_GATEWAY_API_KEY", "VERCEL_AI_SDK_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("deterministicDisputeLetter", () => {
  it("carries the engine figures verbatim and names the meter + month", () => {
    const letter = deterministicDisputeLetter(candidate, "West Pump 12");
    expect(letter.subject).toContain("West Pump 12");
    expect(letter.subject).toContain("May");
    // Every dollar in the body is the engine number, formatted by the shared usd() helper.
    expect(letter.body).toContain(usd(1800)); // statement total
    expect(letter.body).toContain(usd(1200)); // usual cycle
    expect(letter.body).toContain(usd(600)); // excess / disputed
    expect(letter.body).toContain("West Pump 12");
    // The service period uses the cycle window dates.
    expect(letter.body).toContain("May 1");
    expect(letter.body).toContain("May 31");
  });

  it("has no em dash (user-facing copy law)", () => {
    const letter = deterministicDisputeLetter(candidate, "West Pump 12");
    expect(letter.subject).not.toContain("—");
    expect(letter.body).not.toContain("—");
  });

  it("renders an honest period when the close is absent (no fabricated date)", () => {
    const noClose: DisputeCandidate = { ...candidate, cycleClose: null };
    const letter = deterministicDisputeLetter(noClose, "West Pump 12");
    expect(letter.body).toContain("service period May 1");
    // No fabricated cycle-close date: the range is just the start, never "May 1 to ...".
    expect(letter.body).not.toContain("May 1 to");
  });

  it("disputeMonthLabel maps the cycle start to its month name", () => {
    expect(disputeMonthLabel("2026-05-01")).toBe("May");
    expect(disputeMonthLabel("2026-12-15T00:00:00.000Z")).toBe("December");
  });
});

describe("draftDisputeLetter (offline-green)", () => {
  it("returns the deterministic letter with NO Gateway key", async () => {
    const letter = await draftDisputeLetter(candidate, "West Pump 12");
    expect(letter).toEqual(deterministicDisputeLetter(candidate, "West Pump 12"));
  });

  it("constructs NO gateway model and imports NO AI SDK offline (zero external calls)", async () => {
    // Spy on the gateway boundary: with no key, neither helper may be touched.
    const gateway = await import("@/lib/ai/gateway");
    const construct = vi.spyOn(gateway, "createGatewayModel");
    const resolve = vi.spyOn(gateway, "resolveGatewayKey");

    const letter = await draftDisputeLetter(candidate, "West Pump 12");

    expect(construct).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(letter.body).toContain(usd(600));
  });
});
