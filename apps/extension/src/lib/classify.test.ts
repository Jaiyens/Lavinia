import { describe, it, expect } from "vitest";
import { classifyResponse } from "./classify";

describe("classifyResponse", () => {
  it("classifies a real data page as 'data'", () => {
    const body = `# Grower 12345 — Delivered Loads
| Date | Variety | Net Weight |
| ---- | ------- | ---------- |
| 2026-01-12 | Nonpareil | 41,260 |
| 2026-01-19 | Monterey | 38,940 |
Total receipts for the season are shown above.`;
    expect(classifyResponse(body)).toBe("data");
  });

  it("classifies an obvious login page as 'login_wall'", () => {
    const body = `<form action="/login" method="post">
      <label>Email</label><input name="email" />
      <label>Password</label><input type="password" name="password" />
      <button>Sign in</button>
      <a href="/forgot">Forgot your password?</a>
    </form>`;
    expect(classifyResponse(body)).toBe("login_wall");
  });

  it("treats an empty body as 'login_wall'", () => {
    expect(classifyResponse("")).toBe("login_wall");
    expect(classifyResponse("   \n  ")).toBe("login_wall");
  });

  it("catches a session-expired interstitial", () => {
    expect(
      classifyResponse("Your session has expired. Please log in again."),
    ).toBe("login_wall");
  });

  it("catches an access-denied / unauthorized wall", () => {
    expect(classifyResponse("403 — Access Denied")).toBe("login_wall");
    expect(classifyResponse("Unauthorized")).toBe("login_wall");
  });

  it("is case-insensitive", () => {
    expect(classifyResponse("PLEASE SIGN IN TO CONTINUE")).toBe("login_wall");
  });

  it("does not false-positive on data that merely mentions a grower portal", () => {
    const body =
      "Welcome back, grower. Your 2026 delivery summary is ready to download.";
    expect(classifyResponse(body)).toBe("data");
  });

  it("handles non-string input defensively", () => {
    // @ts-expect-error — intentional misuse to prove the guard holds.
    expect(classifyResponse(null)).toBe("login_wall");
    // @ts-expect-error — intentional misuse to prove the guard holds.
    expect(classifyResponse(undefined)).toBe("login_wall");
  });
});
