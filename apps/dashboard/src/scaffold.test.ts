import { describe, expect, it } from "vitest";
import type { Severity } from "@/lib/recommendations/types";
import { type LeverKind } from "@/lib/energy";

// Smoke test: proves Vitest runs, the @/* alias resolves, and the shared types
// compile under strict. Real energy-math tests arrive with Phase 1.
describe("scaffold", () => {
  it("wires up vitest and the @ alias", () => {
    const severity: Severity = "act";
    const lever: LeverKind = "stagger";
    expect(severity).toBe("act");
    expect(lever).toBe("stagger");
  });
});
