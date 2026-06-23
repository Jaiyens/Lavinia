/**
 * LIVE end-to-end test of the SHIPPED runtime render path (not a reimplementation):
 *   runRenderInSandbox (sandbox-run.ts)  ->  extractPdfText + verifyArtifact (verify.ts)
 * booted from a real WeasyPrint snapshot. Proves: (1) the cwd handling lets render.py find report.html,
 * (2) a real money figure survives render -> pdf-parse, (3) the verifier ACCEPTS a clean report and
 * REJECTS a fabricated number (fail-closed).
 *
 * Env required: VERCEL_OIDC_TOKEN (auth) + ALMOND_CODEGEN_SNAPSHOT_ID (the snapshot to boot from).
 * Run: ALMOND_CODEGEN_SNAPSHOT_ID=snap_xxx npx tsx scripts/codegen-render-e2e.ts
 */

import { runRenderInSandbox } from "../src/lib/almond/codegen/sandbox-run";
import { verifyArtifact, extractPdfText, type ManifestEntry } from "../src/lib/almond/codegen/verify";
import {
  composeReportSnapshot,
  formatCentsUsd,
  type ComprehensiveSnapshotMeter,
  type ReportSnapshot,
} from "../src/lib/almond/codegen/snapshot";

/** Build a comprehensive per-meter record from a few core scalars (the rest is honest "not on file"). */
function meter(
  over: Pick<ComprehensiveSnapshotMeter, "id" | "name" | "rateSchedule" | "costSource"> &
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
    coverageState: over.costSource === "BILLED" ? "reconciled" : "no_bill",
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

// A realistic Batth-shaped snapshot. Every rendered number traces back to a field here.
const snapshot: ReportSnapshot = composeReportSnapshot({
  farm: { id: "farm_batth", name: "Creekside Batth Farms" },
  meterCount: 6,
  coverageAsOf: "2026-06-20", // rendered below — exercises the buildAllowlist coverageAsOf fix
  latestMonthSpendCents: 4_500_000, // $45,000.00
  opportunities: [
    { meterName: "Westside Pump 17", fromRate: "AG-A1", toRate: "AG-B", savingsCents: 6_141_776 },
    { meterName: "Dairy Field Pump 4", fromRate: "AG-4B", toRate: "AG-C", savingsCents: 2_345_600 },
    { meterName: "Lateral Booster", fromRate: "AG-A", toRate: "AG-B", savingsCents: 1_200_050 },
  ],
  meters: [
    meter({ id: "m1", name: "Westside Pump 17", rateSchedule: "AG-A1", costSource: "BILLED", latestBilledCents: 1_172_733, latestDemandCents: 278_322 }),
    meter({ id: "m2", name: "Dairy Field Pump 4", rateSchedule: "AG-4B", costSource: "BILLED", latestBilledCents: 845_100, latestDemandCents: 91_400 }),
    meter({ id: "m3", name: "Lateral Booster", rateSchedule: "AG-A", costSource: "BILLED", latestBilledCents: 312_050 }),
    meter({ id: "m4", name: "North Well 2", rateSchedule: "AG-B", costSource: "BILLED", latestBilledCents: 204_900, latestDemandCents: 12_000 }),
    meter({ id: "m5", name: "Home Ranch Pump", rateSchedule: "AG-C", costSource: "NONE" }),
    meter({ id: "m6", name: "South Booster", rateSchedule: "AG-A1", costSource: "NONE" }),
  ],
  coverage: { reconciled: 4, needsReview: 1, noBill: 1 },
});

// The model's declared figures (forward manifest check).
const manifest: ManifestEntry[] = [
  { label: "Westside savings", value: 6_141_776, sourcePath: "opportunities[0].savingsCents" },
  { label: "Dairy savings", value: 2_345_600, sourcePath: "opportunities[1].savingsCents" },
  { label: "Lateral savings", value: 1_200_050, sourcePath: "opportunities[2].savingsCents" },
  { label: "Total savings", value: snapshot.totals.rateSwitchSavingsCents, sourcePath: "totals.rateSwitchSavingsCents" },
  { label: "Latest spend", value: 4_500_000, sourcePath: "totals.latestMonthSpendCents" },
];

const css = `
@page { size: letter; margin: 2cm; }
body { font-family: sans-serif; color: #1c1917; }
h1 { font-size: 22px; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e7e5e4; }
.total { margin-top: 16px; font-weight: 700; }
`;

// Build the report markup ONLY from snapshot-derived values (the discipline the real model must follow).
function buildHtml(opts: { tampered: boolean }): string {
  const rows = snapshot.opportunities
    .map(
      (o) =>
        `<tr><td>${o.rank}</td><td>${o.meterName}</td><td>${o.fromRate} to ${o.toRate}</td><td>${o.savingsDisplay}</td></tr>`,
    )
    .join("");
  const tamper = opts.tampered
    ? `<p class="total">Mystery bonus savings: $99,999.00</p>` // a number NOT in the snapshot
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<h1>${snapshot.farm.name}</h1>
<p>As of ${snapshot.coverageAsOf}. ${snapshot.meterCount} meters connected. Latest month spend ${formatCentsUsd(snapshot.totals.latestMonthSpendCents!)}.</p>
<table><thead><tr><th>Rank</th><th>Meter</th><th>Rate switch</th><th>Annual savings</th></tr></thead><tbody>${rows}</tbody></table>
<p class="total">Total annual savings: ${formatCentsUsd(snapshot.totals.rateSwitchSavingsCents)}</p>
${tamper}
</body></html>`;
}

async function main(): Promise<void> {
  // ---- Test 1: clean report should render AND pass verification ----
  process.stdout.write("=== Test 1: clean report (expect render OK + verify ok) ===\n");
  const clean = await runRenderInSandbox({ snapshot, html: buildHtml({ tampered: false }), css });
  process.stdout.write(`render exitCode=${clean.exitCode}, pdfBytes=${clean.pdfBytes?.length ?? "null"}\n`);
  if (clean.stderr.trim()) process.stdout.write(`[render stderr] ${clean.stderr.trim()}\n`);

  if (clean.pdfBytes === null) {
    process.stdout.write("\n❌ RENDER PATH BROKEN: no PDF produced. (If stderr mentions report.html not found, the writeFiles dir != render cwd.)\n");
    process.exit(1);
  }

  const text = await extractPdfText(clean.pdfBytes);
  const compactText = text.replace(/\s+/g, " ").trim();
  process.stdout.write(`\nExtracted PDF text:\n  ${compactText}\n`);
  process.stdout.write(`Contains "$61,417.76"? ${text.includes("61,417.76") || compactText.includes("61,417.76")}\n`);

  const verdict = verifyArtifact(snapshot, manifest, text);
  process.stdout.write(`\nVerifier verdict (clean): ${JSON.stringify(verdict)}\n`);
  if (!verdict.ok) {
    process.stdout.write(`❌ Clean report unexpectedly REJECTED: ${verdict.reason}\n`);
    process.exit(1);
  }
  process.stdout.write("✅ Clean report rendered and verified.\n");

  // ---- Test 2: tampered report (fabricated number) must be REJECTED ----
  process.stdout.write("\n=== Test 2: tampered report (expect verify REJECT) ===\n");
  const tampered = await runRenderInSandbox({ snapshot, html: buildHtml({ tampered: true }), css });
  if (tampered.pdfBytes === null) {
    process.stdout.write("❌ Tampered render produced no PDF (unexpected).\n");
    process.exit(1);
  }
  const tamperedText = await extractPdfText(tampered.pdfBytes);
  const tamperedVerdict = verifyArtifact(snapshot, manifest, tamperedText);
  process.stdout.write(`Verifier verdict (tampered): ${JSON.stringify(tamperedVerdict)}\n`);
  if (tamperedVerdict.ok) {
    process.stdout.write("❌ FAIL-OPEN: the fabricated $99,999.00 was NOT rejected!\n");
    process.exit(1);
  }
  process.stdout.write(`✅ Fail-closed works: fabricated number rejected (${tamperedVerdict.reason}).\n`);

  process.stdout.write("\n🎉 Full render+verify path validated end-to-end against the live snapshot.\n");
}

main().catch((err) => {
  process.stderr.write(`\nFATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
