import { describe, expect, it } from "vitest";
import { showPendingPullBanner } from "./connection";

// Story 5.3 AC3: the "PG&E is connecting" banner is honest about an in-flight live pull
// while the dashboard works on already-loaded bills. It is a real-farm, bills-in,
// connection-pending state only.
describe("showPendingPullBanner", () => {
  const pending = [{ type: "pge_smd", status: "pending" }];
  const active = [{ type: "pge_smd", status: "active" }];

  it("shows for a real farm whose PG&E pull is pending and bills are already in", () => {
    expect(showPendingPullBanner({ dataKind: "real", connections: pending, hasBills: true })).toBe(true);
  });

  it("does not show once the PG&E connection is active", () => {
    expect(showPendingPullBanner({ dataKind: "real", connections: active, hasBills: true })).toBe(false);
  });

  it("does not show before any bill is loaded (nothing to keep working on)", () => {
    expect(showPendingPullBanner({ dataKind: "real", connections: pending, hasBills: false })).toBe(false);
  });

  it("never shows for the representative demo", () => {
    expect(showPendingPullBanner({ dataKind: "representative", connections: pending, hasBills: true })).toBe(false);
  });

  it("does not show without a pending pge_smd connection", () => {
    expect(showPendingPullBanner({ dataKind: "real", connections: [], hasBills: true })).toBe(false);
  });
});
