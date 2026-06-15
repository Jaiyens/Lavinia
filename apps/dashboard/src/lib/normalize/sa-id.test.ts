import { describe, expect, it } from "vitest";
import { normalizeSaId } from "./sa-id";

describe("normalizeSaId, canonical SA ID + preserved descriptor (AC2)", () => {
  it("returns a bare numeric SA ID unchanged with no descriptor", () => {
    expect(normalizeSaId("1007066742")).toEqual({ saId: "1007066742", descriptor: null });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSaId("  1007066742  ")).toEqual({ saId: "1007066742", descriptor: null });
  });

  it("splits a trailing P0xx descriptor off the canonical id", () => {
    expect(normalizeSaId("1007066742 P001")).toEqual({ saId: "1007066742", descriptor: "P001" });
  });

  it("splits and unwraps a parenthesized descriptor", () => {
    expect(normalizeSaId("1007066742 (P001 - WEST WELL)")).toEqual({
      saId: "1007066742",
      descriptor: "P001 - WEST WELL",
    });
  });

  it("does NOT split on hyphens inside an id", () => {
    expect(normalizeSaId("1007066742-7")).toEqual({ saId: "1007066742-7", descriptor: null });
  });

  it("returns a blank id (never throws) for empty or whitespace-only input", () => {
    expect(normalizeSaId("")).toEqual({ saId: "", descriptor: null });
    expect(normalizeSaId("   ")).toEqual({ saId: "", descriptor: null });
  });

  it("keeps a lone trailing ) in the descriptor (no unbalanced unwrap)", () => {
    // Only a true wrapping pair is unwrapped; a descriptor that merely ends in ) is verbatim.
    expect(normalizeSaId("1007066742 P001)")).toEqual({ saId: "1007066742", descriptor: "P001)" });
  });
});
