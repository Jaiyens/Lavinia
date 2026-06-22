import { describe, expect, it } from "vitest";
import { canonSaId, normalizeAccountNumber, normalizeSaId } from "./sa-id";

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

describe("normalizeAccountNumber, dedupe key across master + export spellings", () => {
  it("strips a trailing check-digit suffix (master 'Full Acct #')", () => {
    expect(normalizeAccountNumber("4699664587-8")).toBe("4699664587");
    expect(normalizeAccountNumber("4507020255-6")).toBe("4507020255");
  });

  it("drops leading zeros from the zero-padded export form", () => {
    expect(normalizeAccountNumber("0091898735")).toBe("91898735");
    expect(normalizeAccountNumber("07302408880")).toBe("7302408880");
  });

  it("collapses the master and export spellings of one account to the same key", () => {
    // Same account, printed two ways: a re-import must merge, not fork a new Account row.
    expect(normalizeAccountNumber("0091898735")).toBe(normalizeAccountNumber("91898735-4"));
  });

  it("returns null for empty/whitespace input and '0' for an all-zero number", () => {
    expect(normalizeAccountNumber("")).toBeNull();
    expect(normalizeAccountNumber("   ")).toBeNull();
    expect(normalizeAccountNumber(null)).toBeNull();
    expect(normalizeAccountNumber(undefined)).toBeNull();
    expect(normalizeAccountNumber("000")).toBe("0");
  });
});

describe("canonSaId, strips PG&E's zero-padding so a CSV SA joins the master sheet", () => {
  it("drops leading zeros from the export's 10-digit padded SA", () => {
    // The real export pads "91898735" to "0091898735"; the master uses the natural id.
    expect(canonSaId("0091898735")).toBe("91898735");
  });

  it("is idempotent on a natural (un-padded) SA id", () => {
    expect(canonSaId("91898735")).toBe("91898735");
  });

  it("trims surrounding whitespace before stripping", () => {
    expect(canonSaId("  0096239479  ")).toBe("96239479");
  });

  it("keeps a hyphen inside the id (does NOT split, unlike normalizeAccountNumber)", () => {
    expect(canonSaId("01007066742-7")).toBe("1007066742-7");
  });

  it("preserves an all-zero string rather than collapsing it to empty", () => {
    expect(canonSaId("0000000000")).toBe("0000000000");
  });
});
