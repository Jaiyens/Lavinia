import { describe, expect, it } from "vitest";
import { loadRateCard } from "@/lib/pge/rate-card";
import {
  buildDemandResponseFinding,
  eligibleForDemandResponseRouting,
} from "./run-solar-insight";

// F7 (H-4, FR30/NFR12): the demand-response routing finding is DISPLAY-ONLY and carries NO fabricated
// DR dollar. These are PURE unit tests over the eligibility gate and the builder - no DB.

const card = loadRateCard();
const AGC = "AGC Ag35+ kW High Use"; // a demand-charge AG-C family schedule (as F1's DB test uses)

describe("eligibleForDemandResponseRouting (H-4, FR30)", () => {
  it("is eligible for an un-enrolled solar meter on the demand-charge AG-C family", () => {
    expect(
      eligibleForDemandResponseRouting({
        isSolar: true,
        rateSchedule: AGC,
        card,
        lineItems: [{ label: "Customer Charge" }],
      }),
    ).toBe(true);
  });

  it("is not eligible for a non-solar meter (the non-solar DR lever is not this path)", () => {
    expect(
      eligibleForDemandResponseRouting({
        isSolar: false,
        rateSchedule: AGC,
        card,
        lineItems: [],
      }),
    ).toBe(false);
  });

  it("is not eligible off the AG-C demand family (no demand charge to curtail against)", () => {
    expect(
      eligibleForDemandResponseRouting({
        isSolar: true,
        rateSchedule: "AGA1 Ag<35 kW Low Use",
        card,
        lineItems: [],
      }),
    ).toBe(false);
  });

  it("is not eligible when the meter is already enrolled (DR is then a fact, never re-pitched)", () => {
    expect(
      eligibleForDemandResponseRouting({
        isSolar: true,
        rateSchedule: AGC,
        card,
        lineItems: [{ label: "PDP Event Day Credit 06/12" }], // a printed DR enrollment line
      }),
    ).toBe(false);
  });

  it("is not eligible with a null schedule (honest absence, never a guessed flag)", () => {
    expect(
      eligibleForDemandResponseRouting({ isSolar: true, rateSchedule: null, card, lineItems: [] }),
    ).toBe(false);
  });
});

describe("buildDemandResponseFinding (H-4, FR30/NFR12)", () => {
  it("builds a display-only act finding with NO fabricated DR dollar (honest-blank)", () => {
    const draft = buildDemandResponseFinding({
      farmId: "farm-1",
      pumpId: "p1",
      meterName: "P101",
      rateSchedule: AGC,
      isSolar: true,
      card,
      lineItems: [{ label: "Customer Charge" }],
      asOf: "2026-06-20T12:00:00.000Z",
    });
    expect(draft).not.toBeNull();
    if (draft === null) throw new Error("expected a finding");
    expect(draft.severity).toBe("act"); // shaped for action, but display-only in v1
    expect(draft.impactUsd ?? null).toBeNull(); // NO fabricated DR $/kW (NFR12) - honest-blank
    expect(draft.impactNote).not.toBeNull(); // the opportunity is named, never a figure
    expect(draft.action.kind).toBe("enroll_demand_response");
    expect(draft.action.execute).toBeNull(); // display-only: nothing is actually enrolled in v1
    expect(draft.situation).toContain("P101"); // traces to the named, visible meter
    // The note quotes no dollar figure (no "$" in it).
    expect(draft.impactNote ?? "").not.toMatch(/\$/);
  });

  it("returns null for an ineligible meter, so a caller can route unconditionally", () => {
    expect(
      buildDemandResponseFinding({
        farmId: "farm-1",
        pumpId: "p2",
        meterName: "P200",
        rateSchedule: AGC,
        isSolar: false, // non-solar -> ineligible
        card,
        lineItems: [],
      }),
    ).toBeNull();
  });
});
