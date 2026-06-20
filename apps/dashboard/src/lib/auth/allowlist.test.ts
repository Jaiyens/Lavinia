import { afterEach, describe, expect, it, vi } from "vitest";
import { isLockdownOn, isStaticallyAllowed, parseAllowlist } from "./allowlist";

// isStaticallyAllowed's empty-allowlist default is environment-aware (fail-closed in prod, open
// in dev/test), so every test stubs NODE_ENV/VERCEL_ENV explicitly rather than trusting whatever
// the runner happens to set. Restore the real env after each test.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("allowlist (pre-launch lockdown)", () => {
  it("is OFF (no list configured) when ACCESS_ALLOWLIST is unset or empty", () => {
    expect(isLockdownOn(undefined)).toBe(false);
    expect(isLockdownOn("")).toBe(false);
    expect(isLockdownOn("  , ,")).toBe(false);
  });

  it("with no list AND not production, sign-in stays open (local dev + CI not locked out)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    expect(isStaticallyAllowed("anyone@anywhere.com", undefined)).toBe(true);
    expect(isStaticallyAllowed(null, undefined)).toBe(true);
  });

  it("with no list AND production, sign-in is DENIED (fail-closed on the public domain)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    // A forgotten env var must lock the door, not leave it wide open.
    expect(isStaticallyAllowed("anyone@anywhere.com", undefined)).toBe(false);
    expect(isStaticallyAllowed(null, undefined)).toBe(false);
    // Same fail-closed result via NODE_ENV=production outside Vercel.
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isStaticallyAllowed("anyone@anywhere.com", undefined)).toBe(false);
  });

  it("parses + normalizes a comma list", () => {
    const set = parseAllowlist("Bob@Farm.com, investor@vc.com ,, dup@x.com");
    expect(set.has("bob@farm.com")).toBe(true);
    expect(set.has("investor@vc.com")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("when ON, allows listed emails case-insensitively and denies everyone else", () => {
    // A configured list decides access in every environment, so the env is irrelevant here.
    vi.stubEnv("VERCEL_ENV", "production");
    const raw = "owner@batth.com, investor@vc.com";
    expect(isLockdownOn(raw)).toBe(true);
    expect(isStaticallyAllowed("OWNER@batth.com", raw)).toBe(true);
    expect(isStaticallyAllowed("stranger@evil.com", raw)).toBe(false);
    expect(isStaticallyAllowed(null, raw)).toBe(false);
  });
});
