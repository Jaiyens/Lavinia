import { describe, expect, it } from "vitest";
import { parseEmailList } from "./team";

describe("parseEmailList", () => {
  it("splits on commas/semicolons/spaces/newlines, normalizes, and dedupes", () => {
    const { valid, invalid } = parseEmailList("A@x.com, b@x.com\n a@x.com ; c@x.com");
    expect(valid).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(invalid).toEqual([]);
  });

  it("separates tokens that do not look like an email", () => {
    const { valid, invalid } = parseEmailList("good@x.com, notanemail, bad@");
    expect(valid).toEqual(["good@x.com"]);
    expect(invalid).toContain("notanemail");
    expect(invalid).toContain("bad@");
  });

  it("returns empty lists for blank/separator-only input", () => {
    expect(parseEmailList("  \n , ; ")).toEqual({ valid: [], invalid: [] });
  });
});
