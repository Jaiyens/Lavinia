import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NemReconciliationSchema } from "@/lib/extract/schema";
import { type NemInventoryView, normalizeNem } from "./nem";

// The realistic 12-month statement fixture, validated through the Story 1.3 schema so the
// normalize test operates on the same shape the pipeline produces (not a hand-rolled stub).
const rawNem = NemReconciliationSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "fixtures/extract/sample-nem-page.json"), "utf8")),
);

// An inventory whose array's generating SA ID matches the fixture, with two benefiting meters.
const inventory: NemInventoryView = {
  arrays: [
    {
      arrayId: "array-840",
      arrayName: "West 840 kW",
      generatingSaId: "1010898065",
      benefitingMeterSaIds: ["1007066742", "1009111222"],
    },
    {
      arrayId: "array-1092",
      arrayName: "East 1,092 kW",
      generatingSaId: "9999999999",
      benefitingMeterSaIds: ["2000000001"],
    },
  ],
};

describe("normalizeNem, raw NEM page -> canonical NEM reconciliation", () => {
  it("maps every monthly row 1:1 in order and preserves negative net kWh (AC1/AC2)", () => {
    const out = normalizeNem(rawNem, inventory);

    // AC1: 12 distinct periods, in source order, never collapsed or summed.
    expect(out.months).toHaveLength(12);
    expect(out.months.map((m) => m.start)).toEqual(rawNem.monthlyRows.map((r) => r.periodStart));

    // AC2: an over-production month's negative net kWh arrives VERBATIM (no floor/abs/clamp).
    const december = out.months.find((m) => m.start === "2025-12-01");
    if (!december) throw new Error("expected the December period to map through");
    expect(december.netKwh).toBe(-6840.0);
    expect(out.months.some((m) => m.netKwh < 0)).toBe(true);
  });

  it("carries the annual true-up value and date through (AC1)", () => {
    const out = normalizeNem(rawNem, inventory);
    expect(out.trueUpMonth).toBe(4);
    expect(out.trueUpDate).toBe("2026-04-15");
    expect(out.trueUpAmountCents).toBe(1842300);
  });

  it("links the generating array by SA ID and names its benefiting meters (AC3)", () => {
    const out = normalizeNem(rawNem, inventory);
    expect(out.generatingSaId).toBe("1010898065");
    expect(out.arrayId).toBe("array-840");
    expect(out.arrayName).toBe("West 840 kW");
    expect(out.benefitingMeterSaIds).toEqual(["1007066742", "1009111222"]);
    // Linked but not yet reconciled - Story 1.7 promotes it to "reconciled".
    expect(out.coverageState).toBe("no_bill");
  });

  it("trims SA IDs on both sides before matching (AC3)", () => {
    const padded = { ...rawNem, saId: "  1010898065  " };
    const out = normalizeNem(padded, inventory);
    expect(out.generatingSaId).toBe("1010898065");
    expect(out.arrayId).toBe("array-840");
  });

  it("links a descriptor-bearing NEM SA by the canonical core (Story 1.8 unification)", () => {
    // A real NEM page prints "<id> <PumpID>" (e.g. "1010898065 P003"); the inventory key is the
    // bare id. Both sides normalize through normalizeSaId, so the descriptor-bearing SA links.
    const withDescriptor = { ...rawNem, saId: "1010898065 P003" };
    const out = normalizeNem(withDescriptor, inventory);
    expect(out.generatingSaId).toBe("1010898065");
    expect(out.arrayId).toBe("array-840");
    expect(out.coverageState).toBe("no_bill");
  });

  it("never fabricates a link: an unmatched SA ID is needs_review (AC3 / NFR-4)", () => {
    const orphan = { ...rawNem, saId: "0000000000" };
    const out = normalizeNem(orphan, inventory);
    expect(out.arrayId).toBeNull();
    expect(out.arrayName).toBeNull();
    expect(out.benefitingMeterSaIds).toEqual([]);
    expect(out.coverageState).toBe("needs_review");
    // The SA is still named so a needs_review allocation is traceable.
    expect(out.generatingSaId).toBe("0000000000");
    // The monthly data is still captured even when the array link fails.
    expect(out.months).toHaveLength(12);
  });

  it("never links on a blank SA ID even when an inventory array's key is also blank (AC3 / data-fidelity)", () => {
    // A 1.6 projection could coerce a null SolarArray.saId to "". A raw page with a blank
    // saId must NOT trim-match that blank key and inherit a wrong array's benefiting meters.
    const blankKeyed: NemInventoryView = {
      arrays: [
        {
          arrayId: "array-blank",
          arrayName: "Blank-key array",
          generatingSaId: "",
          benefitingMeterSaIds: ["3000000003"],
        },
      ],
    };
    const out = normalizeNem({ ...rawNem, saId: "   " }, blankKeyed);
    expect(out.arrayId).toBeNull();
    expect(out.benefitingMeterSaIds).toEqual([]);
    expect(out.coverageState).toBe("needs_review");
    expect(out.generatingSaId).toBe("");
  });

  it("treats an ambiguous multi-array match as needs_review, not a guess (AC3)", () => {
    const ambiguous: NemInventoryView = {
      arrays: [
        { ...inventory.arrays[0]! },
        { ...inventory.arrays[0]!, arrayId: "array-dupe", arrayName: "Dupe" },
      ],
    };
    const out = normalizeNem(rawNem, ambiguous);
    expect(out.arrayId).toBeNull();
    expect(out.coverageState).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
// Story G-1 (FR27): the preserved fail-closed gate. After the Solar tab work
// (the populator harden in C-1 and every new solar derivation), normalizeNem's
// fail-closed posture must be UNCHANGED: an unlinkable array still lands
// needs_review with a null array and no benefiting meters, and nothing the
// Solar tab adds may set a linked coverageState (no_bill / reconciled) without a
// real, unambiguous SA-ID match. These are release-condition guard assertions,
// not new behavior - if a future solar story loosens the gate, one of these
// fails as a blocker.
// ---------------------------------------------------------------------------
describe("G-1: normalizeNem stays fail-closed after the solar additions (FR27)", () => {
  it("never produces a linked coverageState (no_bill/reconciled) without an exact SA-ID match", () => {
    // Every way an array link can fail still fails closed to needs_review: an
    // unmatched SA, a blank SA, and an ambiguous multi-match. None may slip into
    // a linked state that would later attach a NEM credit to a possibly-wrong array.
    const unmatched = normalizeNem({ ...rawNem, saId: "0000000000" }, inventory);
    const blank = normalizeNem({ ...rawNem, saId: "   " }, inventory);
    const ambiguous = normalizeNem(rawNem, {
      arrays: [{ ...inventory.arrays[0]! }, { ...inventory.arrays[0]!, arrayId: "dupe" }],
    });
    for (const out of [unmatched, blank, ambiguous]) {
      expect(out.coverageState).toBe("needs_review");
      // A needs_review page is NEVER promoted to a linked state by absence of evidence.
      expect(out.coverageState).not.toBe("no_bill");
      expect(out.coverageState).not.toBe("reconciled");
    }
  });

  it("an unlinkable array fabricates no link: null array, no benefiting meters, months still captured", () => {
    const orphan = normalizeNem({ ...rawNem, saId: "0000000000" }, inventory);
    // The fabrication the gate forbids: a guessed arrayId or inherited benefiting meters.
    expect(orphan.arrayId).toBeNull();
    expect(orphan.arrayName).toBeNull();
    expect(orphan.benefitingMeterSaIds).toEqual([]);
    // The data is preserved so the needs_review allocation stays traceable (no data loss
    // is the fail-closed posture: withhold the LINK, never the figures).
    expect(orphan.months).toHaveLength(12);
    expect(orphan.generatingSaId).toBe("0000000000");
  });

  it("a real, unique match is the ONLY path to a linked state, and it stays unreconciled (no_bill)", () => {
    // The gate permits a linked state only on an exact match, and even then never
    // jumps to "reconciled" - that promotion is the cent gate's job (reconcile.ts),
    // never the normalizer's. So a perfect array link is no_bill, awaiting the cent reconcile.
    const linked = normalizeNem(rawNem, inventory);
    expect(linked.arrayId).toBe("array-840");
    expect(linked.coverageState).toBe("no_bill");
    expect(linked.coverageState).not.toBe("reconciled");
  });
});
