import { describe, expect, it } from "vitest";
import { closeDateShort, ordinal } from "./date";

describe("ordinal", () => {
  it("handles 1/2/3, the teens, and the twenties", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
  });
});

describe("closeDateShort", () => {
  it("formats an ISO date as 'Wkd the Nth' in UTC", () => {
    expect(closeDateShort("2026-03-20")).toBe("Fri the 20th");
    expect(closeDateShort("2026-03-20T00:00:00.000Z")).toBe("Fri the 20th");
    expect(closeDateShort("2026-03-12")).toBe("Thu the 12th");
  });
  it("returns empty for a malformed date", () => {
    expect(closeDateShort("nonsense")).toBe("");
  });
});
