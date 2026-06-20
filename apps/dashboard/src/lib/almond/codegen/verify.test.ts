import { describe, expect, it } from "vitest";
import { composeReportSnapshot, type ReportSnapshot } from "./snapshot";
import { buildAllowlist, resolvePath, verifyArtifact, type ManifestEntry } from "./verify";

// Pure, offline (no DB, no sandbox, no PDF parsing): the fail-closed core. The forward manifest check
// and the reverse number-token scan are tested directly on a snapshot + manifest + a `pdfText` string
// (the live path feeds real pdf-parse output into the same `verifyArtifact`).

const SNAPSHOT: ReportSnapshot = composeReportSnapshot({
  farm: { id: "farm1", name: "Batth Farms" },
  meterCount: 183,
  coverageAsOf: "2026-05-31",
  latestMonthSpendCents: null,
  opportunities: [
    { meterName: "Westside Pump 17", fromRate: "AG-B", toRate: "AG-C", savingsCents: 6_141_776 },
    { meterName: "Lateral 3 Booster", fromRate: "AG-C", toRate: "AG-B", savingsCents: 682_588 },
  ],
});

// An HONEST rendered document: every number is a snapshot value (the two savings, their total, the
// meter count, the "17"/"3" inside the meter names, the rate codes carry no standalone digits).
const HONEST_PDF_TEXT = [
  "Batth Farms — Top Opportunities",
  "183 meters reviewed",
  "1. Westside Pump 17  AG-B to AG-C  $61,417.76",
  "2. Lateral 3 Booster  AG-C to AG-B  $6,825.88",
  "Total estimated savings: $68,243.64",
].join("\n");

/** The honest manifest: each shown figure declared with its snapshot path. Total = 6_141_776 +
 *  682_588 = 6_824_364 cents = $68,243.64 (this snapshot has exactly these two opportunities). */
const HONEST_MANIFEST: ManifestEntry[] = [
  { label: "Westside savings", value: 6_141_776, sourcePath: "opportunities[0].savingsCents" },
  { label: "Lateral savings", value: 682_588, sourcePath: "opportunities[1].savingsCents" },
  { label: "Total savings", value: 6_824_364, sourcePath: "totals.rateSwitchSavingsCents" },
];

describe("resolvePath", () => {
  it("resolves dotted and indexed paths, undefined for missing", () => {
    expect(resolvePath(SNAPSHOT, "opportunities[0].savingsCents")).toBe(6_141_776);
    expect(resolvePath(SNAPSHOT, "totals.rateSwitchSavingsCents")).toBe(6_824_364);
    expect(resolvePath(SNAPSHOT, "meterCount")).toBe(183);
    expect(resolvePath(SNAPSHOT, "opportunities[9].savingsCents")).toBeUndefined();
    expect(resolvePath(SNAPSHOT, "totals.nope")).toBeUndefined();
  });
});

describe("buildAllowlist", () => {
  it("admits snapshot money (cent and whole-dollar forms) and numbers inside meter names", () => {
    const allow = buildAllowlist(SNAPSHOT);
    expect(allow.has("61417.76")).toBe(true); // cent-precise
    expect(allow.has("61418")).toBe(true); // rounded whole dollars
    expect(allow.has("61417")).toBe(true); // floored whole dollars
    expect(allow.has("183")).toBe(true); // meter count
    expect(allow.has("17")).toBe(true); // "Westside Pump 17"
    expect(allow.has("3")).toBe(true); // "Lateral 3 Booster"
    expect(allow.has("9999")).toBe(false); // a fabricated value is NOT admitted
  });
});

describe("verifyArtifact", () => {
  it("accepts an honest artifact (forward + reverse both pass)", () => {
    expect(verifyArtifact(SNAPSHOT, HONEST_MANIFEST, HONEST_PDF_TEXT)).toEqual({ ok: true });
  });

  it("REJECTS a tampered manifest value (forward check)", () => {
    const tampered = HONEST_MANIFEST.map((e, i) =>
      i === 0 ? { ...e, value: 9_999_999 } : e,
    );
    const verdict = verifyArtifact(SNAPSHOT, tampered, HONEST_PDF_TEXT);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/mismatch/i);
  });

  it("REJECTS a manifest path that does not resolve (forward check)", () => {
    const bogus = [...HONEST_MANIFEST, { label: "ghost", value: 1, sourcePath: "opportunities[7].savingsCents" }];
    const verdict = verifyArtifact(SNAPSHOT, bogus, HONEST_PDF_TEXT);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/not found/i);
  });

  it("REJECTS a PDF that shows a number absent from both the manifest and the snapshot (reverse scan)", () => {
    // The model rendered a fabricated "$12,500.00 in extra savings" it never declared — exactly the
    // omission hole the manifest alone cannot catch. The reverse scan over the real PDF text catches it.
    const sneaky = `${HONEST_PDF_TEXT}\nBonus: $12,500.00 in extra savings`;
    const verdict = verifyArtifact(SNAPSHOT, HONEST_MANIFEST, sneaky);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/undeclared number/i);
  });

  it("REJECTS a malformed or empty manifest (fail closed)", () => {
    expect(verifyArtifact(SNAPSHOT, "not an array", HONEST_PDF_TEXT).ok).toBe(false);
    expect(verifyArtifact(SNAPSHOT, [], HONEST_PDF_TEXT).ok).toBe(false);
    expect(verifyArtifact(SNAPSHOT, [{ label: "x", value: 1 }], HONEST_PDF_TEXT).ok).toBe(false);
  });
});
