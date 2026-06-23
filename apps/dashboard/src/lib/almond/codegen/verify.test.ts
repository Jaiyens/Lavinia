import { describe, expect, it } from "vitest";
import {
  composeReportSnapshot,
  type ComprehensiveSnapshotMeter,
  type ReportSnapshot,
} from "./snapshot";
import { buildAllowlist, resolvePath, verifyArtifact, verifyWorkbookArtifact, type ManifestEntry } from "./verify";

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

// ---------------------------------------------------------------------------
// The ONE GENERAL NUMBER GUARD: a comprehensive snapshot's numbers — entity/account digits, ranch
// digits, gpm, kW, every cost source (incl MODELED), solar share — must ALL be admitted (recursive walk),
// while a number present NOWHERE in the snapshot is still rejected (fail-closed).
// ---------------------------------------------------------------------------

/** A comprehensive per-meter record from a few core scalars (the rest honest "not on file"). */
function comprehensive(
  over: Pick<ComprehensiveSnapshotMeter, "id" | "name" | "rateSchedule"> &
    Partial<ComprehensiveSnapshotMeter>,
): ComprehensiveSnapshotMeter {
  return {
    serviceId: null,
    accountNumber: null,
    entityName: null,
    entityBillingName: null,
    ranchName: null,
    cropName: null,
    blocks: [],
    isLegacy: false,
    serialCode: null,
    status: null,
    powerSource: "electric",
    gpm: null,
    latitude: null,
    longitude: null,
    coverageState: "reconciled",
    costSource: "BILLED",
    modeledMonthlyCents: null,
    latestBilledCents: null,
    latestDemandCents: null,
    latestPeakKw: null,
    latestCycleClose: null,
    recentBills: [],
    solar: {
      isSolar: false,
      nemType: null,
      solarKw: null,
      trueUpMonth: null,
      trueUpAmountCents: null,
      trueUpDate: null,
      benefitingArrays: [],
      nemPeriods: [],
      sharePct: null,
      demandOwedCents: null,
      uncoveredShare: null,
      grandfather: { state: "unknown" },
    },
    ...over,
  };
}

const COMPREHENSIVE: ReportSnapshot = composeReportSnapshot({
  farm: { id: "farm1", name: "Batth Farms" },
  meterCount: 3,
  coverageAsOf: "2026-05-31",
  latestMonthSpendCents: 1_732_700,
  opportunities: [
    { meterName: "Westside Pump 17", fromRate: "AG-B", toRate: "AG-C", savingsCents: 6_141_776 },
  ],
  meters: [
    comprehensive({
      id: "m1",
      name: "Westside Pump 17",
      rateSchedule: "AG-B",
      accountNumber: "1234567890",
      entityName: "Batth Bros LLC",
      ranchName: "Ranch 12",
      gpm: 1200,
      costSource: "BILLED",
      latestBilledCents: 1_172_733,
      latestDemandCents: 278_322,
      latestPeakKw: 140,
    }),
    comprehensive({
      id: "m2",
      name: "Lateral 3 Booster",
      rateSchedule: "AG-C",
      coverageState: "no_bill",
      costSource: "MODELED",
      modeledMonthlyCents: 312_050,
    }),
    comprehensive({
      id: "m3",
      name: "Solar Pump 5",
      rateSchedule: "AG-B",
      coverageState: "no_bill",
      costSource: "NONE",
      solar: {
        isSolar: true,
        nemType: "nem2",
        solarKw: 840,
        trueUpMonth: 4,
        trueUpAmountCents: -120_000,
        trueUpDate: "2026-04-15T00:00:00.000Z",
        benefitingArrays: [],
        nemPeriods: [{ start: "2026-03-01T00:00:00.000Z", close: "2026-03-31T00:00:00.000Z", netKwh: -1200, amountCents: -30_000 }],
        sharePct: 0.42,
        demandOwedCents: 50_000,
        uncoveredShare: 0.3,
        grandfather: { state: "known", expiryYear: 2040, yearsRemaining: 14 },
      },
    }),
  ],
  coverage: { reconciled: 1, needsReview: 0, noBill: 2 },
});

describe("buildAllowlist (comprehensive snapshot: every number admitted, recursive walk)", () => {
  const allow = buildAllowlist(COMPREHENSIVE);

  it("admits entity / account / ranch digits mined from strings", () => {
    expect(allow.has("1234567890")).toBe(true); // account number string token
    expect(allow.has("17")).toBe(true); // "Westside Pump 17"
    expect(allow.has("12")).toBe(true); // "Ranch 12"
    expect(allow.has("3")).toBe(true); // "Lateral 3 Booster"
    expect(allow.has("5")).toBe(true); // "Solar Pump 5"
  });

  it("admits plain quantities (gpm, peak kW, solar kW)", () => {
    expect(allow.has("1200")).toBe(true); // gpm
    expect(allow.has("140")).toBe(true); // peak kW
    expect(allow.has("840")).toBe(true); // solar kW
  });

  it("admits money across EVERY cost source: BILLED, MODELED, demand, NEM true-up/period", () => {
    expect(allow.has("11727.33")).toBe(true); // BILLED latestBilledCents -> dollars
    expect(allow.has("2783.22")).toBe(true); // latestDemandCents -> dollars
    expect(allow.has("3120.50")).toBe(true); // MODELED modeledMonthlyCents -> dollars
    expect(allow.has("-1200.00")).toBe(true); // NEM true-up amount (negative credit) -> dollars
    expect(allow.has("-300.00")).toBe(true); // NEM period amountCents -> dollars
  });

  it("admits the solar share / uncovered share and a negative netKwh quantity", () => {
    // sharePct 0.42 and uncoveredShare 0.3 are plain numbers (admitted as String + rounded).
    expect(allow.has("0.42")).toBe(true);
    expect(allow.has("0.3")).toBe(true);
    expect(allow.has("-1200")).toBe(true); // netKwh
    expect(allow.has("2040")).toBe(true); // grandfather expiryYear
    expect(allow.has("14")).toBe(true); // yearsRemaining
  });

  it("admits a fraction's PERCENT forms so an honest share rendered as a percent passes", () => {
    // The chat states sharePct 0.42 as "42%", so a sheet/report may too: its percent forms are admitted.
    expect(allow.has("42")).toBe(true); // Math.round(0.42 * 100)
    expect(allow.has("42.00")).toBe(true); // (0.42 * 100).toFixed(2) -> canon "42.00"
    expect(allow.has("30")).toBe(true); // uncoveredShare 0.3 -> 30%
  });

  it("STILL rejects a number present nowhere in the snapshot (fail-closed)", () => {
    expect(allow.has("9999")).toBe(false);
    expect(allow.has("424242")).toBe(false);
    // And end-to-end: a fabricated dollar in the rendered text is rejected by the reverse scan.
    const v = verifyWorkbookArtifact(COMPREHENSIVE, [], "Batth Farms\n11727.33\n42424.24");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/undeclared number/i);
    // ...while every real number passes.
    expect(verifyWorkbookArtifact(COMPREHENSIVE, [], "11727.33\n3120.50\n1200\n840").ok).toBe(true);
  });

  it("derived sum/count widening still works over the comprehensive snapshot", () => {
    // A real money sum of the two known per-meter dollars (1_172_733 + 312_050 = 1_484_783c =
    // $14,847.83) is NOT a raw snapshot value; the derived entry widens it, and a wrong one does not.
    const good = [{ kind: "derived", label: "t", value: 1_484_783, op: "sum", sourcePaths: ["meters[0].latestBilledCents", "meters[1].modeledMonthlyCents"] }];
    expect(verifyWorkbookArtifact(COMPREHENSIVE, good, "Total\n14847.83")).toEqual({ ok: true });
    const wrong = [{ kind: "derived", label: "t", value: 9_999_999, op: "sum", sourcePaths: ["meters[0].latestBilledCents", "meters[1].modeledMonthlyCents"] }];
    expect(verifyWorkbookArtifact(COMPREHENSIVE, wrong, "Total\n99999.99").ok).toBe(false);
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
