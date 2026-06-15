import { describe, expect, it } from "vitest";
import { canonicalEntityKey, displayOwner } from "./entity";

describe("canonicalEntityKey, the deterministic dedupe identity", () => {
  it("collapses the 7-variants-to-6-entities typo case", () => {
    // The real Batth sheet prints one owner two ways; they must share a key.
    expect(canonicalEntityKey("Batth Farms LLC")).toBe(
      canonicalEntityKey("Batth Farms, LLC."),
    );
  });

  it("normalizes legal suffixes (L.L.C. == LLC, Inc. == Incorporated)", () => {
    expect(canonicalEntityKey("Acme L.L.C.")).toBe(canonicalEntityKey("Acme LLC"));
    expect(canonicalEntityKey("Acme Inc.")).toBe(canonicalEntityKey("Acme Incorporated"));
  });

  it("normalizes & to AND and ignores case and stray whitespace", () => {
    expect(canonicalEntityKey("S & K Batth Inc")).toBe(
      canonicalEntityKey("s and k  batth   inc"),
    );
  });

  it("does NOT collapse two genuinely different owners", () => {
    expect(canonicalEntityKey("Batth Farms LLC")).not.toBe(
      canonicalEntityKey("Gill & Batth Farms LLC"),
    );
    expect(canonicalEntityKey("Sahota Ranches Inc")).not.toBe(
      canonicalEntityKey("Deol Family Trust"),
    );
  });
});

describe("displayOwner, the readable canonical owner", () => {
  it("is stable across variants of one owner", () => {
    expect(displayOwner("Batth Farms LLC")).toBe(displayOwner("Batth Farms, LLC."));
  });

  it("title-cases words, keeps legal suffixes upper, lowercases the AND connector", () => {
    expect(displayOwner("Batth Farms, LLC.")).toBe("Batth Farms LLC");
    expect(displayOwner("S & K Batth Inc")).toBe("S and K Batth INC");
  });
});
