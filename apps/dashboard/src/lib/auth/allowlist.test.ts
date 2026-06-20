import { describe, expect, it } from "vitest";
import { isLockdownOn, isStaticallyAllowed, parseAllowlist } from "./allowlist";

describe("allowlist (pre-launch lockdown)", () => {
  it("is OFF when ACCESS_ALLOWLIST is unset or empty (open sign-in, unchanged)", () => {
    expect(isLockdownOn(undefined)).toBe(false);
    expect(isLockdownOn("")).toBe(false);
    expect(isLockdownOn("  , ,")).toBe(false);
    // With lockdown off, anyone (even an empty email) may sign in.
    expect(isStaticallyAllowed("anyone@anywhere.com", undefined)).toBe(true);
    expect(isStaticallyAllowed(null, undefined)).toBe(true);
  });

  it("parses + normalizes a comma list", () => {
    const set = parseAllowlist("Bob@Farm.com, investor@vc.com ,, dup@x.com");
    expect(set.has("bob@farm.com")).toBe(true);
    expect(set.has("investor@vc.com")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("when ON, allows listed emails case-insensitively and denies everyone else", () => {
    const raw = "owner@batth.com, investor@vc.com";
    expect(isLockdownOn(raw)).toBe(true);
    expect(isStaticallyAllowed("OWNER@batth.com", raw)).toBe(true);
    expect(isStaticallyAllowed("stranger@evil.com", raw)).toBe(false);
    expect(isStaticallyAllowed(null, raw)).toBe(false);
  });
});
