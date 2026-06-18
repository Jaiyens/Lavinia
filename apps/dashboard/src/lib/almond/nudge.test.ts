import { describe, expect, it } from "vitest";
import { shouldShowAlmondNudge } from "./nudge";

// The laws this story exists to enforce (Story 10.2): the first-run nudge is owner-only and once-only.
describe("shouldShowAlmondNudge (the first-run gate)", () => {
  it("shows to a real owner who has not dismissed it", () => {
    expect(shouldShowAlmondNudge({ dataKind: "real", dismissed: false })).toBe(true);
  });

  it("hides once the real owner has dismissed it (never reappears)", () => {
    expect(shouldShowAlmondNudge({ dataKind: "real", dismissed: true })).toBe(false);
  });

  it("never shows on the public Tour / demo (representative), dismissed or not", () => {
    expect(shouldShowAlmondNudge({ dataKind: "representative", dismissed: false })).toBe(false);
    expect(shouldShowAlmondNudge({ dataKind: "representative", dismissed: true })).toBe(false);
  });
});
