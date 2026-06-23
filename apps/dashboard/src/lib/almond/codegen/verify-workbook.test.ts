import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { composeReportSnapshot, type ReportSnapshot, type SnapshotMeter } from "./snapshot";
import { extractXlsxNumbers, verifyWorkbookArtifact } from "./verify";
import { buildStyledWorkbook, type SheetCell } from "@/lib/almond/export/workbook";

// Pure, offline (no DB, no sandbox): the Phase 3 WORKBOOK fail-closed guard. The forward check now
// recomputes DERIVED entries (sum/count), and the reverse scan reopens the ACTUAL produced .xlsx
// (extractXlsxNumbers, the real impure boundary, exercised here on bytes the styled builder produces).

const METERS: SnapshotMeter[] = [
  { id: "m1", name: "Westside Pump 17", rate: "AG-B", costCents: 1_172_733, demandCents: 278_322 },
  { id: "m2", name: "Lateral 3 Booster", rate: "AG-C", costCents: 50_000, demandCents: null },
];

const SNAPSHOT: ReportSnapshot = composeReportSnapshot({
  farm: { id: "farm1", name: "Batth Farms" },
  meterCount: 183,
  coverageAsOf: "2026-05-31",
  latestMonthSpendCents: 1_732_700,
  opportunities: [
    { meterName: "Westside Pump 17", fromRate: "AG-B", toRate: "AG-C", savingsCents: 6_141_776 },
    { meterName: "Lateral 3 Booster", fromRate: "AG-C", toRate: "AG-B", savingsCents: 682_588 },
  ],
  meters: METERS,
  coverage: { reconciled: 2, needsReview: 0, noBill: 0 },
});

// Total = 6_141_776 + 682_588 = 6_824_364 cents = $68,243.64.
const SAVINGS_LITERALS = [
  { label: "s0", value: 6_141_776, sourcePath: "opportunities[0].savingsCents" },
  { label: "s1", value: 682_588, sourcePath: "opportunities[1].savingsCents" },
];

describe("verifyWorkbookArtifact (forward: literal + derived)", () => {
  const honestCellText = ["Batth Farms overview", "183", "61417.76", "6825.88", "68243.64"].join("\n");

  it("accepts literal figures that resolve to the snapshot", () => {
    const manifest = [...SAVINGS_LITERALS, { label: "total", value: 6_824_364, sourcePath: "totals.rateSwitchSavingsCents" }];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, honestCellText)).toEqual({ ok: true });
  });

  it("accepts a DERIVED sum the verifier recomputes from the snapshot", () => {
    const manifest = [
      ...SAVINGS_LITERALS,
      { kind: "derived", label: "total", value: 6_824_364, op: "sum", sourcePaths: ["opportunities[0].savingsCents", "opportunities[1].savingsCents"] },
    ];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, honestCellText)).toEqual({ ok: true });
  });

  it("REJECTS a derived sum whose declared value is wrong", () => {
    const manifest = [
      ...SAVINGS_LITERALS,
      { kind: "derived", label: "total", value: 9_999_999, op: "sum", sourcePaths: ["opportunities[0].savingsCents", "opportunities[1].savingsCents"] },
    ];
    const v = verifyWorkbookArtifact(SNAPSHOT, manifest, honestCellText);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/derived mismatch/i);
  });

  it("accepts a DERIVED count (array length) and rejects a wrong one", () => {
    const text = ["Opportunities: 2"].join("\n");
    const ok = verifyWorkbookArtifact(SNAPSHOT, [{ kind: "derived", label: "n", value: 2, op: "count", sourcePaths: ["opportunities"] }], text);
    expect(ok).toEqual({ ok: true });
    const bad = verifyWorkbookArtifact(SNAPSHOT, [{ kind: "derived", label: "n", value: 5, op: "count", sourcePaths: ["opportunities"] }], text);
    expect(bad.ok).toBe(false);
  });

  it("admits a per-meter LITERAL value with NO manifest entry (snapshot-widened allowlist)", () => {
    // The Meters tab prints meter m1's cost $11,727.33 (1_172_733c) — present in snapshot.meters, so the
    // reverse scan allows it even though only the savings are in the manifest. This is the widening that
    // lets a generalized workbook print grounded per-meter money without a manifest entry per cell.
    const text = ["Westside Pump 17", "11727.33", "2783.22", "61417.76"].join("\n");
    const manifest = [{ label: "s0", value: 6_141_776, sourcePath: "opportunities[0].savingsCents" }];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, text)).toEqual({ ok: true });
  });

  it("REJECTS a number absent from the manifest AND the snapshot (reverse scan, fail closed)", () => {
    const sneaky = `${honestCellText}\nBonus: 99999.00`;
    const manifest = [...SAVINGS_LITERALS, { label: "total", value: 6_824_364, sourcePath: "totals.rateSwitchSavingsCents" }];
    const v = verifyWorkbookArtifact(SNAPSHOT, manifest, sneaky);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/undeclared number/i);
  });

  it("REJECTS a malformed / empty / unknown-kind manifest (fail closed)", () => {
    expect(verifyWorkbookArtifact(SNAPSHOT, "nope", honestCellText).ok).toBe(false);
    expect(verifyWorkbookArtifact(SNAPSHOT, [], honestCellText).ok).toBe(false);
    expect(verifyWorkbookArtifact(SNAPSHOT, [{ kind: "magic", label: "x", value: 1 }], honestCellText).ok).toBe(false);
    expect(verifyWorkbookArtifact(SNAPSHOT, [{ kind: "derived", label: "x", value: 1, op: "sum", sourcePaths: [] }], honestCellText).ok).toBe(false);
  });

  it("REJECTS a derived sum with a DUPLICATE sourcePath (anti double-count)", () => {
    // Listing the same path twice would let the verifier compute a doubled total it then trusts.
    const manifest = [
      { kind: "derived", label: "doubled", value: 12_283_552, op: "sum", sourcePaths: ["opportunities[0].savingsCents", "opportunities[0].savingsCents"] },
    ];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, "Total\n122835.52").ok).toBe(false);
  });

  it("REJECTS a derived sum over a NON-money (structural) field", () => {
    // meterCount / ranks are not cents; a sum can only aggregate money fields (paths ending in 'Cents').
    const manifest = [{ kind: "derived", label: "bad", value: 183, op: "sum", sourcePaths: ["meterCount"] }];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, "183").ok).toBe(false);
  });

  it("REJECTS a SIGN-FLIPPED figure: a cell showing -$X when the snapshot holds +$X", () => {
    // The model renders the real savings as a negative (a fake credit) and omits it from the manifest.
    // The sign-aware reverse scan must catch it (the allowlist holds only the positive form).
    const manifest = [{ label: "s0", value: 6_141_776, sourcePath: "opportunities[0].savingsCents" }];
    const v = verifyWorkbookArtifact(SNAPSHOT, manifest, "Westside Pump 17\n-61417.76");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/undeclared number/i);
  });

  it("ACCEPTS an HONEST negative currency value (a NEM credit / refund) against its signed allowlist form", () => {
    const creditSnap = composeReportSnapshot({
      farm: { id: "f", name: "F" },
      meterCount: 1,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: [],
      meters: [{ id: "m1", name: "Solar Pump", rate: "AG-B", costCents: -5_000, demandCents: null }],
      coverage: { reconciled: 1, needsReview: 0, noBill: 0 },
    });
    // The Meters tab shows the credit as -$50.00; a literal manifest entry ties it to the snapshot.
    const v = verifyWorkbookArtifact(creditSnap, [{ label: "credit", value: -5_000, sourcePath: "meters[0].costCents" }], "Solar Pump\n-50.00");
    expect(v).toEqual({ ok: true });
  });
});

describe("verifyWorkbookArtifact on PDF text (the shared guard codegenExport feeds extractPdfText into)", () => {
  // The from-scratch PDF path (src/lib/almond/skills/codegen-export.ts) verifies the rendered report with
  // the SAME verifyWorkbookArtifact, passing extractPdfText output as `cellText`. Unlike the flattened
  // .xlsx cells (bare "61417.76"), real PDF text carries currency formatting ("$61,417.76") and thousands
  // separators. canon() normalizes `$`/commas, so the same allowlist must accept the formatted forms and
  // still reject a fabricated one — these cases lock that shared usage in.
  const honestPdfText = [
    "Batth Farms top opportunities",
    "183 meters reviewed",
    "1. Westside Pump 17  AG-B to AG-C  $61,417.76",
    "2. Lateral 3 Booster  AG-C to AG-B  $6,825.88",
    "Total estimated savings: $68,243.64",
  ].join("\n");

  it("accepts honest, currency-FORMATTED PDF figures via a derived total", () => {
    const manifest = [
      ...SAVINGS_LITERALS,
      { kind: "derived", label: "total", value: 6_824_364, op: "sum", sourcePaths: ["opportunities[0].savingsCents", "opportunities[1].savingsCents"] },
    ];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, honestPdfText)).toEqual({ ok: true });
  });

  it("REJECTS a fabricated currency-formatted figure the model snuck into the PDF prose", () => {
    const sneaky = `${honestPdfText}\nBonus: $12,500.00 in extra savings`;
    const manifest = [
      ...SAVINGS_LITERALS,
      { label: "total", value: 6_824_364, sourcePath: "totals.rateSwitchSavingsCents" },
    ];
    const v = verifyWorkbookArtifact(SNAPSHOT, manifest, sneaky);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/undeclared number/i);
  });

  it("treats empty PDF text (extraction failed) as forward-only: the manifest still gates", () => {
    // extractPdfText returns "" on a parse failure (documented contract); with no number tokens to scan,
    // the forward manifest check is the sole authority — a valid manifest passes, a bad one still fails.
    const ok = verifyWorkbookArtifact(SNAPSHOT, [{ label: "s0", value: 6_141_776, sourcePath: "opportunities[0].savingsCents" }], "");
    expect(ok).toEqual({ ok: true });
    const bad = verifyWorkbookArtifact(SNAPSHOT, [{ label: "ghost", value: 1, sourcePath: "opportunities[9].savingsCents" }], "");
    expect(bad.ok).toBe(false);
  });
});

describe("extractXlsxNumbers + verifyWorkbookArtifact (end-to-end over real .xlsx bytes)", () => {
  /** Build a one-sheet workbook of typed cells and return its bytes as a Buffer. */
  async function workbook(rows: SheetCell[][], totals?: SheetCell[]): Promise<Buffer> {
    const bytes = await buildStyledWorkbook({
      sheets: [
        {
          name: "Rate savings",
          title: "Batth Farms rate-switch savings",
          columns: [{ header: "Meter" }, { header: "Estimated savings" }],
          rows,
          footer: [],
          totals,
        },
      ],
    });
    return Buffer.from(bytes);
  }

  it("verifies an honest workbook: every printed currency number traces to the snapshot", async () => {
    const bytes = await workbook(
      [
        [{ value: "Westside Pump 17" }, { value: 61_417.76, format: "currency" }],
        [{ value: "Lateral 3 Booster" }, { value: 6_825.88, format: "currency" }],
      ],
      [{ value: "Total" }, { value: 68_243.64, format: "currency" }],
    );
    const cellText = await extractXlsxNumbers(bytes);
    expect(cellText).not.toBeNull();
    const manifest = [
      ...SAVINGS_LITERALS,
      { kind: "derived", label: "total", value: 6_824_364, op: "sum", sourcePaths: ["opportunities[0].savingsCents", "opportunities[1].savingsCents"] },
    ];
    expect(verifyWorkbookArtifact(SNAPSHOT, manifest, cellText!)).toEqual({ ok: true });
  });

  it("REJECTS a workbook that prints a fabricated currency value", async () => {
    const bytes = await workbook([
      [{ value: "Phantom Pump" }, { value: 4_242.42, format: "currency" }], // $4,242.42 is in no snapshot field
    ]);
    const cellText = await extractXlsxNumbers(bytes);
    expect(cellText).not.toBeNull();
    const v = verifyWorkbookArtifact(SNAPSHOT, SAVINGS_LITERALS, cellText!);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/undeclared number/i);
  });

  it("emits the cent-precise form for a currency value ending in a zero cent (no trailing-zero mismatch)", async () => {
    const snap = composeReportSnapshot({
      farm: { id: "f", name: "F" },
      meterCount: 1,
      coverageAsOf: null,
      latestMonthSpendCents: null,
      opportunities: [{ meterName: "P", fromRate: "AG-A1", toRate: "AG-B", savingsCents: 6_141_770 }],
    });
    const bytes = await workbook([[{ value: "P" }, { value: 61_417.7, format: "currency" }]]);
    const cellText = await extractXlsxNumbers(bytes);
    expect(cellText).not.toBeNull();
    expect(cellText!).toContain("61417.70");
    expect(verifyWorkbookArtifact(snap, [{ label: "s", value: 6_141_770, sourcePath: "opportunities[0].savingsCents" }], cellText!)).toEqual({ ok: true });
  });

  it("returns null (=> caller falls back) for a non-zip / unparsable buffer", async () => {
    expect(await extractXlsxNumbers(Buffer.from("this is not a zip file at all"))).toBeNull();
  });

  it("returns null for a FORMULA cell (a smuggled '=...' the cell-value scan would miss)", async () => {
    // Build a workbook with a real formula cell via ExcelJS directly (the openpyxl shim turns a model
    // '=99999' string into exactly this). Excel would DISPLAY the result, so the verifier must reject.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    ws.getCell("A1").value = { formula: "1+1", result: 99999 } as unknown as ExcelJS.CellValue;
    const bytes = Buffer.from((await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer);
    expect(await extractXlsxNumbers(bytes)).toBeNull();
  });
});
