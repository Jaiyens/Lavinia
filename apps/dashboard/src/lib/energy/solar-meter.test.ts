import { describe, expect, it } from "vitest";
import { isSolarNemMeter, nemSettlement } from "./solar-meter";

describe("isSolarNemMeter", () => {
  it("is false for a plain non-solar meter (no signal)", () => {
    expect(isSolarNemMeter({ isSolar: false, solarKw: null, nemType: null })).toBe(false);
  });

  it("is true when the importer flagged isSolar", () => {
    expect(isSolarNemMeter({ isSolar: true, solarKw: null, nemType: null })).toBe(true);
  });

  it("is true when a paired array nameplate (solarKw) is on file", () => {
    expect(isSolarNemMeter({ isSolar: false, solarKw: 24.5, nemType: null })).toBe(true);
  });

  it("is true for a nemType-only meter (the widened case the inline checks missed)", () => {
    expect(isSolarNemMeter({ isSolar: false, solarKw: null, nemType: "nem2" })).toBe(true);
  });

  it("treats solarKw of 0 as a solar signal (a non-null nameplate)", () => {
    // solarKw is null when not on file; a literal 0 is still a paired array fact, not absence.
    expect(isSolarNemMeter({ isSolar: false, solarKw: 0, nemType: null })).toBe(true);
  });

  it("is true when several signals are present", () => {
    expect(isSolarNemMeter({ isSolar: true, solarKw: 10, nemType: "NEM2AG" })).toBe(true);
  });
});

describe("nemSettlement", () => {
  it("is unsettled when no true-up amount is on file", () => {
    expect(nemSettlement({ trueUpAmountCents: null })).toBe("unsettled");
  });

  it("is settled once a printed true-up amount is on file", () => {
    expect(nemSettlement({ trueUpAmountCents: 123_45 })).toBe("settled");
  });

  it("treats a zero true-up amount as settled (a printed $0 reconciliation is a fact)", () => {
    expect(nemSettlement({ trueUpAmountCents: 0 })).toBe("settled");
  });

  it("treats a negative true-up amount (a credit) as settled", () => {
    expect(nemSettlement({ trueUpAmountCents: -500_00 })).toBe("settled");
  });
});
