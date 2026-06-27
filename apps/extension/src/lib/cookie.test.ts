import { describe, it, expect } from "vitest";
import { buildCookieHeader, type CookiePair } from "./cookie";

describe("buildCookieHeader", () => {
  it("joins cookies into an RFC 6265 cookie-string", () => {
    const cookies: CookiePair[] = [
      { name: "session", value: "abc123" },
      { name: "csrf", value: "tok-xyz" },
    ];
    expect(buildCookieHeader(cookies)).toBe("session=abc123; csrf=tok-xyz");
  });

  it("returns an empty string for no cookies", () => {
    expect(buildCookieHeader([])).toBe("");
  });

  it("skips cookies with an empty name", () => {
    const cookies: CookiePair[] = [
      { name: "", value: "orphan" },
      { name: "keep", value: "1" },
    ];
    expect(buildCookieHeader(cookies)).toBe("keep=1");
  });

  it("tolerates an empty cookie value", () => {
    const cookies: CookiePair[] = [{ name: "flag", value: "" }];
    expect(buildCookieHeader(cookies)).toBe("flag=");
  });

  it("de-duplicates by name, keeping the last occurrence", () => {
    const cookies: CookiePair[] = [
      { name: "session", value: "old" },
      { name: "session", value: "new" },
    ];
    expect(buildCookieHeader(cookies)).toBe("session=new");
  });

  it("preserves raw (un-encoded) values verbatim", () => {
    // chrome.cookies returns the stored value as-is; we must not re-encode it.
    const cookies: CookiePair[] = [{ name: "jwt", value: "a.b-c_d" }];
    expect(buildCookieHeader(cookies)).toBe("jwt=a.b-c_d");
  });
});
