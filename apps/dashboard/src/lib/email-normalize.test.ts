import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email-normalize";

describe("normalizeEmail", () => {
  it("lowercases the whole address so two casings are one identity", () => {
    expect(normalizeEmail("Bob@Farm.COM")).toBe("bob@farm.com");
    expect(normalizeEmail("bob@farm.com")).toBe(normalizeEmail("BOB@FARM.COM"));
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  bob@farm.com \n")).toBe("bob@farm.com");
  });

  it("applies Unicode NFKC so compatibility forms collapse", () => {
    // Fullwidth letters (U+FF42 etc.) NFKC-fold to ASCII, then lowercase.
    expect(normalizeEmail("ｂob@farm.com")).toBe("bob@farm.com");
  });

  it("keeps plus-tags and dots DISTINCT (errs toward isolation, never merging)", () => {
    expect(normalizeEmail("a+ops@farm.com")).toBe("a+ops@farm.com");
    expect(normalizeEmail("a+ops@farm.com")).not.toBe(normalizeEmail("a@farm.com"));
    expect(normalizeEmail("a.b@farm.com")).not.toBe(normalizeEmail("ab@farm.com"));
  });

  it("is idempotent", () => {
    const once = normalizeEmail("  Bob@Farm.com ");
    expect(normalizeEmail(once)).toBe(once);
  });
});
