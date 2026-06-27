// Committed fixture pages for the crop scrape STUB. These are synthetic, hand-authored almond yield
// pages — NOT a real grower's data and NOT a captured secret — so the workflow can run end-to-end in
// dev/CI with ZERO external calls and zero credentials. The live Sandbox scrape (sandbox-scrape.ts)
// replaces these with real captured bytes when creds are present.
//
// The numbers here intentionally RECONCILE: the two variety line items (Nonpareil 1,200,000 +
// Monterey 800,000) sum to the printed grand total (2,000,000 lbs), so the pound-gate certifies them
// as "reconciled" in the happy-path test. A second fixture is deliberately CORRUPTED (its stated
// total disagrees with its line items) to exercise the needs_review route.

import type { RawPage } from "./types";

/** sha-256 hex of a UTF-8 string. Sync, dependency-free (node:crypto), used to key fixtures. */
import { createHash } from "node:crypto";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function htmlPage(url: string, html: string): RawPage {
  const bytes = new TextEncoder().encode(html);
  return { url, sha: sha256Hex(html), contentType: "text/html", bytes };
}

/** A reconciling yield summary: line items sum exactly to the printed grand total. */
const RECONCILING_HTML = `<!doctype html>
<html lang="en">
  <head><title>Yield Summary 2024</title></head>
  <body>
    <h1>Crop Year 2024 Yield Summary</h1>
    <table id="yield">
      <thead><tr><th>Variety</th><th>Meat Pounds</th></tr></thead>
      <tbody>
        <tr><td>Nonpareil</td><td data-pounds="1200000">1,200,000</td></tr>
        <tr><td>Monterey</td><td data-pounds="800000">800,000</td></tr>
      </tbody>
      <tfoot><tr><th>Grand Total</th><th data-control-total="2000000">2,000,000</th></tr></tfoot>
    </table>
  </body>
</html>`;

/** A corrupted yield summary: the printed total disagrees with the line items (gate -> needs_review). */
const CORRUPTED_HTML = `<!doctype html>
<html lang="en">
  <head><title>Yield Summary 2024 (corrupted)</title></head>
  <body>
    <h1>Crop Year 2024 Yield Summary</h1>
    <table id="yield">
      <thead><tr><th>Variety</th><th>Meat Pounds</th></tr></thead>
      <tbody>
        <tr><td>Nonpareil</td><td data-pounds="1200000">1,200,000</td></tr>
        <tr><td>Monterey</td><td data-pounds="800000">800,000</td></tr>
      </tbody>
      <tfoot><tr><th>Grand Total</th><th data-control-total="1900000">1,900,000</th></tr></tfoot>
    </table>
  </body>
</html>`;

/** The reconciling fixture page set returned by the stub scrape. */
export function reconcilingFixturePages(): RawPage[] {
  return [htmlPage("https://stub.invalid/yield/2024", RECONCILING_HTML)];
}

/** The corrupted fixture page set (for the needs_review path). */
export function corruptedFixturePages(): RawPage[] {
  return [htmlPage("https://stub.invalid/yield/2024-corrupted", CORRUPTED_HTML)];
}
