import { describe, expect, it } from "vitest";
import { centsFromDollars, formatUsd, formatUsdCompact } from "./money";

describe("formatUsd, integer cents -> tabular dollars", () => {
  it("formats positive cents with grouping and two decimals", () => {
    expect(formatUsd(1172733)).toBe("$11,727.33");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(5)).toBe("$0.05");
    expect(formatUsd(100)).toBe("$1.00");
  });

  it("formats negative cents with a leading minus", () => {
    expect(formatUsd(-500)).toBe("-$5.00");
  });
});

describe("formatUsdCompact, integer cents -> lowercase compact dollars", () => {
  it("compacts thousands and millions with one decimal max", () => {
    expect(formatUsdCompact(3412500)).toBe("$34.1k"); // $34,125.00
    expect(formatUsdCompact(7800000)).toBe("$78k");
    expect(formatUsdCompact(123456789)).toBe("$1.2m");
    expect(formatUsdCompact(45000)).toBe("$450");
  });
});

describe("centsFromDollars, float dollars -> integer cents", () => {
  it("rounds to the nearest cent and absorbs float drift", () => {
    expect(centsFromDollars(117.27)).toBe(11727);
    expect(centsFromDollars(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
    expect(centsFromDollars(11727.33)).toBe(1172733);
  });

  it("rounds a true half-cent product up like the bill prints it, despite binary drift", () => {
    // 1 x 0.145 = 14.499999999999998 in float, but the decimal value is 14.5 cents.
    expect(centsFromDollars(1 * 0.145)).toBe(15);
    expect(centsFromDollars(500 * 0.15861)).toBe(7931); // 79.305 -> half-up
  });
});
