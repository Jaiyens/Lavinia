// Back-catalog backfill for the crop production ledger. For each historical target in a manifest
// (farmId, entityId, cropYear, r2Key — the raw pages a prior scrape stored in R2), it pulls the raw
// bytes from R2, runs the ZDR extraction cascade (Sonnet -> Opus), and the pound-gate decides what is
// real: only `reconciled` documents are written as ProductionRecords (source ALMOND_LOGIC, the
// historical estimate); `needs_review` documents are reported and skipped, never fabricated.
//
// GROWER-DATA / ZDR (rule 6): extraction runs on the direct Anthropic zero-data-retention endpoint
// (src/lib/ai/zdr.ts), NEVER the Vercel AI Gateway. Gated on hasZdrKey() + r2Configured(); absent
// either, it exits cleanly without calling out. Logs only { entityId, cropYear, coverage } counts —
// never a key, a grower secret, or page bytes.
//
// COST SEAM: this is the per-item fleet runner (the same shape as scripts/extract-bills-batch.ts).
// The Anthropic Batch API (~50% cheaper, async 24h turnaround) is the optimization for a large back
// catalog: submit all pages as one batch, poll, then gate the results through the SAME reconcileDocument.
// That swap lives behind this entry point and changes no gate logic. TODO(batch): wire the Batch API.
//
// Run (from apps/dashboard), once ANTHROPIC_ZDR_API_KEY + R2_* are set in the env:
//   npx tsx scripts/backfill-crop-catalog.ts --manifest ./back-catalog.json
//   npx tsx scripts/backfill-crop-catalog.ts --manifest ./back-catalog.json --limit 5   # smoke test

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createZdrPoundReader, runExtraction } from "@/lib/crops/extract/reader";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { hasZdrKey } from "@/lib/ai/zdr";
import { prisma } from "@/lib/db";
import { R2ObjectStore, r2Configured } from "@/lib/storage/r2";

/** One historical raw page to re-extract, as recorded by a prior scrape (storedKeys provenance). */
type BackCatalogTarget = {
  farmId: string;
  entityId: string;
  cropYear: number;
  r2Key: string;
};

/** Load KEY=VALUE pairs from a local env file into process.env (does not overwrite existing). */
function loadEnv(file: string): void {
  try {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      const key = match?.[1];
      if (key && !(key in process.env)) {
        process.env[key] = (match[2] ?? "").replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // file absent is fine
  }
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readBytes(store: R2ObjectStore, key: string): Promise<Uint8Array | null> {
  const read = await store.get(key);
  if (!read) return null;
  const chunks: Uint8Array[] = [];
  const reader = read.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function main(): Promise<void> {
  loadEnv(".env.local");

  if (!hasZdrKey() || !r2Configured()) {
    console.log(
      "backfill: skipped (needs ANTHROPIC_ZDR_API_KEY for ZDR extraction and R2_* for raw-page reads).",
    );
    return;
  }

  const manifestPath = arg("--manifest");
  if (!manifestPath) {
    console.error("backfill: --manifest <path> is required (JSON array of {farmId,entityId,cropYear,r2Key}).");
    process.exitCode = 1;
    return;
  }
  const limit = Number(arg("--limit") ?? "0");

  const targets = JSON.parse(readFileSync(manifestPath, "utf8")) as BackCatalogTarget[];
  const slice = limit > 0 ? targets.slice(0, limit) : targets;

  const store = new R2ObjectStore();
  const reader = createZdrPoundReader();
  const tally = { reconciled: 0, needs_review: 0, no_doc: 0, missing: 0, written: 0 };

  for (const target of slice) {
    const bytes = await readBytes(store, target.r2Key);
    if (!bytes) {
      tally.missing += 1;
      console.log(JSON.stringify({ entityId: target.entityId, cropYear: target.cropYear, coverage: "missing" }));
      continue;
    }
    // The extractor reads the page's text layer (RawPage = string), not the raw bytes.
    const pageText = new TextDecoder().decode(bytes);
    const result = await runExtraction(reader, pageText);
    tally[result.coverage] += 1;
    console.log(
      JSON.stringify({ entityId: target.entityId, cropYear: target.cropYear, coverage: result.coverage }),
    );

    // Only reconciled documents become real pounds. needs_review is reported, never written.
    if (result.coverage === "reconciled") {
      await withFarmTenant(prisma, target.farmId, async (tx) => {
        for (const row of result.rows) {
          await tx.productionRecord.create({
            data: {
              farmId: target.farmId,
              cropYear: target.cropYear,
              variety: row.variety,
              pounds: row.pounds,
              source: "ALMOND_LOGIC",
              controlTotalPounds: result.controlTotalPounds,
              coverageState: "reconciled",
              supersededReason: `back-catalog backfill (${target.entityId})`,
            },
          });
        }
      });
      tally.written += 1;
    }
  }

  console.log(`backfill complete: ${JSON.stringify(tally)}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("backfill failed:", err instanceof Error ? err.message : "unknown error");
  await prisma.$disconnect();
  process.exit(1);
});
