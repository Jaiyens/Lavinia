import { describe, expect, it } from "vitest";
import { generateLoginCode, isLoginCodeFormat, LOGIN_CODE_LENGTH } from "./login-code";

// The sign-in code generator. The format invariant (exactly 6 ASCII digits) is the security-
// relevant property: a non-padded low value would be < 6 digits, shrinking the keyspace a guesser
// must cover, so we assert it holds across a large sample (which inevitably includes leading-zero
// draws below 100000 and proves the zero-padding).
describe("generateLoginCode", () => {
  it("is always exactly LOGIN_CODE_LENGTH ASCII digits", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateLoginCode();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(code).toHaveLength(LOGIN_CODE_LENGTH);
    }
  });

  it("stays within 000000-999999", () => {
    for (let i = 0; i < 2000; i++) {
      const n = Number(generateLoginCode());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(999_999);
    }
  });
});

describe("isLoginCodeFormat", () => {
  it("accepts exactly six digits", () => {
    expect(isLoginCodeFormat("000000")).toBe(true);
    expect(isLoginCodeFormat("123456")).toBe(true);
    expect(isLoginCodeFormat("007009")).toBe(true);
  });

  it("rejects wrong length, non-digits, and whitespace", () => {
    expect(isLoginCodeFormat("12345")).toBe(false);
    expect(isLoginCodeFormat("1234567")).toBe(false);
    expect(isLoginCodeFormat("12345a")).toBe(false);
    expect(isLoginCodeFormat("12 456")).toBe(false);
    expect(isLoginCodeFormat(" 123456")).toBe(false);
    expect(isLoginCodeFormat("")).toBe(false);
  });
});
