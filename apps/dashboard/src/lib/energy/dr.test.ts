import { describe, expect, it } from "vitest";
import { en } from "@/copy/en";
import { drEnrollment } from "./dr";

describe("drEnrollment (FR-18: info from the printed bill only)", () => {
  it("detects each program from its printed spellings, embedded in real label shapes", () => {
    expect(drEnrollment([{ label: "PDP Event Day Credit 06/12" }])).toBe("pdp");
    expect(drEnrollment([{ label: "Peak Day Pricing Credit" }])).toBe("pdp");
    expect(drEnrollment([{ label: "BIP Incentive" }])).toBe("bip");
    expect(drEnrollment([{ label: "Base Interruptible Program Credit" }])).toBe("bip");
    expect(drEnrollment([{ label: "CBP Capacity Credit" }])).toBe("cbp");
    expect(drEnrollment([{ label: "Capacity Bidding Program" }])).toBe("cbp");
  });

  it("is case tolerant and skips null labels", () => {
    expect(drEnrollment([{ label: null }, { label: "peak day pricing credit" }])).toBe("pdp");
  });

  it("returns null when nothing prints - never a guess", () => {
    expect(drEnrollment([])).toBeNull();
    expect(drEnrollment([{ label: null }])).toBeNull();
    expect(
      drEnrollment([
        { label: "Customer Charge 30 days @ $1.43343" },
        { label: "Energy Commission Tax" },
        { label: "Max Demand 02/11-02/28 244.32 kW @$26.03" },
      ]),
    ).toBeNull();
  });

  it("word boundaries hold on BOTH alternatives; hyphen/space variants still match", () => {
    expect(drEnrollment([{ label: "supdput line" }])).toBeNull();
    expect(drEnrollment([{ label: "ambipolar charge" }])).toBeNull();
    // The spelled-out names are bounded too: embedded words must not fire.
    expect(drEnrollment([{ label: "speak day pricing" }])).toBeNull();
    expect(drEnrollment([{ label: "incapacity bidding rule" }])).toBeNull();
    // Scan artifacts: hyphenation and doubled spaces still detect.
    expect(drEnrollment([{ label: "Peak-Day Pricing Event Credit" }])).toBe("pdp");
    expect(drEnrollment([{ label: "Peak  Day  Pricing" }])).toBe("pdp");
  });

  it("does not mutate its input", () => {
    const items = [{ label: "PDP Event Credit" }];
    const snapshot = JSON.parse(JSON.stringify(items)) as unknown;
    drEnrollment(items);
    expect(items).toEqual(snapshot);
  });
});

describe("the two TOU clocks in DR copy (AR-14)", () => {
  it("the enrolled caption phrases the 4 to 9 event window and never the rate peak", () => {
    const caption = en.shell.drawer.drEnrolledNote;
    // The positive pin is the WINDOW PHRASE, not bare digits.
    expect(caption).toMatch(/from 4 to 9|between 4 and 9/);
    // The negative pin covers the realistic spellings of the 5-8 rate peak:
    // "5 and 8", "5 to 8", "5-8", "5 pm to 8 pm", en dash, "through", words.
    expect(caption).not.toMatch(
      /(5|five)\s*(\.?\s*p\.?m\.?)?\s*(and|to|through|-|\u2013)\s*(8|eight)/i,
    );
  });
});
