import { describe, expect, it } from "vitest";
import { isKnownVariety, normalizeVariety } from "./variety";

describe("normalizeVariety — join CSV codes to scrape names", () => {
  it("maps codes and full names to the same canonical key", () => {
    expect(normalizeVariety("np")).toBe("NONPAREIL");
    expect(normalizeVariety("Nonpareil")).toBe("NONPAREIL");
    expect(normalizeVariety("NONPAREIL")).toBe("NONPAREIL");
    expect(normalizeVariety("m")).toBe("MONTEREY");
    expect(normalizeVariety("f")).toBe("FRITZ");
    expect(normalizeVariety("ald")).toBe("ALDRICH");
    expect(normalizeVariety("i")).toBe("INDEPENDENCE");
    expect(normalizeVariety("ind")).toBe("INDEPENDENCE");
    expect(normalizeVariety(" Monterey ")).toBe("MONTEREY");
  });

  it("returns an unknown code uppercased as-is (never guessed into a full name)", () => {
    expect(normalizeVariety("bp")).toBe("BP");
    expect(normalizeVariety("avl")).toBe("AVL");
    expect(normalizeVariety("MONTEREY/NONPAREIL")).toBe("MONTEREY/NONPAREIL");
  });

  it("blank/absent -> UNKNOWN", () => {
    expect(normalizeVariety("")).toBe("UNKNOWN");
    expect(normalizeVariety("  ")).toBe("UNKNOWN");
    expect(normalizeVariety(null)).toBe("UNKNOWN");
    expect(normalizeVariety(undefined)).toBe("UNKNOWN");
  });

  it("isKnownVariety distinguishes mapped varieties from raw codes", () => {
    expect(isKnownVariety("NONPAREIL")).toBe(true);
    expect(isKnownVariety("INDEPENDENCE")).toBe(true);
    expect(isKnownVariety("BP")).toBe(false);
    expect(isKnownVariety("UNKNOWN")).toBe(false);
  });
});
