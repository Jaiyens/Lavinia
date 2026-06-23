import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowlist } from "./auth-allowlist";

// The pre-launch sign-in allowlist. parseAllowlist normalizes the AUTH_ALLOWLIST env value;
// isEmailAllowed decides whether a given email may complete sign-in. Fail closed by default.
describe("parseAllowlist", () => {
  it("returns an empty set for an undefined or blank value", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
    expect(parseAllowlist("   ").size).toBe(0);
  });

  it("splits on commas, trims, and lowercases", () => {
    const set = parseAllowlist(" Manager@Batth.com , owner@creekside.com ");
    expect(set.has("manager@batth.com")).toBe(true);
    expect(set.has("owner@creekside.com")).toBe(true);
  });

  it("drops empty entries from stray commas", () => {
    expect(parseAllowlist("a@x.com,,b@x.com,").size).toBe(2);
  });
});

describe("isEmailAllowed", () => {
  it("denies every email when the allowlist is empty (fail closed)", () => {
    expect(isEmailAllowed("anyone@anywhere.com", parseAllowlist(undefined))).toBe(false);
  });

  it("allows an email that is on the list (case-insensitive)", () => {
    const list = parseAllowlist("manager@batth.com");
    expect(isEmailAllowed("manager@batth.com", list)).toBe(true);
    expect(isEmailAllowed("Manager@Batth.com", list)).toBe(true);
    expect(isEmailAllowed("  manager@batth.com ", list)).toBe(true);
  });

  it("denies an email that is not on the list", () => {
    const list = parseAllowlist("manager@batth.com");
    expect(isEmailAllowed("stranger@elsewhere.com", list)).toBe(false);
  });

  it("denies a missing email", () => {
    const list = parseAllowlist("manager@batth.com");
    expect(isEmailAllowed(null, list)).toBe(false);
    expect(isEmailAllowed(undefined, list)).toBe(false);
    expect(isEmailAllowed("", list)).toBe(false);
  });

  it("allows everyone when the list is the wildcard", () => {
    const list = parseAllowlist("*");
    expect(isEmailAllowed("anyone@anywhere.com", list)).toBe(true);
    expect(isEmailAllowed(null, list)).toBe(true);
  });
});
