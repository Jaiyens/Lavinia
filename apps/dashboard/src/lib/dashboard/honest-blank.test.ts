// The honest-blank / honest-unknown state discriminator (G-0). Pure unit test of the shared state the
// derivations emit: a net-metering DOLLAR with no statement on file is "blank" (the honest-blank
// upload-to-settle state), a STRUCTURAL datum genuinely absent is "unknown" (a distinct honest-unknown
// state), and a value genuinely on file is "settled". The two absences are NEVER confused: a dollar is
// never "unknown" and a structural fact is never "blank". This is the one law (program structure/timing
// is on file; net-metering dollar credits are not) implemented as a tested state machine.

import { describe, expect, it } from "vitest";
import {
  dollarState,
  structuralState,
  isHonestBlank,
  type HonestBlankState,
} from "./honest-blank";

describe("dollarState (the net-metering DOLLAR cell)", () => {
  it("is BLANK when the credit amount is null (no statement on file)", () => {
    expect(dollarState(null)).toEqual({ kind: "blank" });
  });

  it("is BLANK when the credit amount is undefined (no statement on file)", () => {
    expect(dollarState(undefined)).toEqual({ kind: "blank" });
  });

  it("is BLANK for a non-finite amount (NaN / Infinity could only be a bug, never a credit)", () => {
    expect(dollarState(Number.NaN)).toEqual({ kind: "blank" });
    expect(dollarState(Number.POSITIVE_INFINITY)).toEqual({ kind: "blank" });
    expect(dollarState(Number.NEGATIVE_INFINITY)).toEqual({ kind: "blank" });
  });

  it("is SETTLED for a real on-file amount in cents", () => {
    expect(dollarState(12345)).toEqual({ kind: "settled" });
  });

  it("is SETTLED for a real on-file CREDIT (a negative amount is money owed to the grower)", () => {
    expect(dollarState(-5000)).toEqual({ kind: "settled" });
  });

  it("is SETTLED for a genuine on-file zero (a statement can settle to nothing, never honest-blank)", () => {
    // Zero is a REAL settled value, not an absence: a true-up can net to $0. Only the ABSENCE of an
    // amount is honest-blank, never a real 0 that would otherwise read as "not on file".
    expect(dollarState(0)).toEqual({ kind: "settled" });
  });

  it("never returns the structural-absence (unknown) state for a dollar (the two never cross)", () => {
    // A net-metering dollar is either settled or honest-BLANK, never honest-unknown - so a credit
    // cell always carries the upload-to-settle path, never the structural-absence treatment.
    for (const v of [null, undefined, Number.NaN, 0, 100, -100]) {
      expect(dollarState(v).kind).not.toBe("unknown");
    }
  });
});

describe("structuralState (a non-dollar STRUCTURAL datum)", () => {
  it("is UNKNOWN when the datum is null (honest-unknown, never honest-blank)", () => {
    // A missing nameplate / true-up month carries no statement to upload, so it is honest-UNKNOWN -
    // never the dollar honest-blank, which would wrongly offer an upload-to-settle path.
    expect(structuralState<number>(null)).toEqual({ kind: "unknown" });
  });

  it("is UNKNOWN when the datum is undefined", () => {
    expect(structuralState<string>(undefined)).toEqual({ kind: "unknown" });
  });

  it("is SETTLED for a present number (e.g. a nameplate on file)", () => {
    expect(structuralState(840)).toEqual({ kind: "settled" });
  });

  it("is SETTLED for a present zero (a real structural zero is on file, never unknown)", () => {
    expect(structuralState(0)).toEqual({ kind: "settled" });
  });

  it("is SETTLED for a present string (e.g. an array name on file)", () => {
    expect(structuralState("West array")).toEqual({ kind: "settled" });
  });

  it("is SETTLED for a present empty string (an explicit empty value is still on file)", () => {
    expect(structuralState("")).toEqual({ kind: "settled" });
  });

  it("never returns the dollar honest-blank state for a structural datum (the two never cross)", () => {
    for (const v of [null, undefined, 0, 840, "West"]) {
      expect(structuralState(v).kind).not.toBe("blank");
    }
  });
});

describe("isHonestBlank (does this state render the shared primitive?)", () => {
  it("is true for the dollar honest-blank state", () => {
    expect(isHonestBlank({ kind: "blank" })).toBe(true);
  });

  it("is true for the structural honest-unknown state", () => {
    expect(isHonestBlank({ kind: "unknown" })).toBe(true);
  });

  it("is false for a settled value (the caller renders the real value, not the primitive)", () => {
    expect(isHonestBlank({ kind: "settled" })).toBe(false);
  });

  it("narrows away the settled variant so a caller can branch on one union end to end", () => {
    const states: HonestBlankState[] = [{ kind: "settled" }, { kind: "blank" }, { kind: "unknown" }];
    const absences = states.filter(isHonestBlank);
    expect(absences).toEqual([{ kind: "blank" }, { kind: "unknown" }]);
    // The narrowed type can only be "blank" | "unknown" - asserted at the type level by the assignment.
    for (const a of absences) {
      const kind: "blank" | "unknown" = a.kind;
      expect(kind === "blank" || kind === "unknown").toBe(true);
    }
  });
});
