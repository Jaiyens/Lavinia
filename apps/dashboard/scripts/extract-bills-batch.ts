// Batch runner for the scanned-bill extraction pipeline over the new Batth statement PDFs.
// It is the fleet version of `import-demo-account.ts`: for every PDF in BatthData/NewPDFS it runs
// the LIVE end-to-end extraction (split -> classify -> extract on Sonnet, escalate cent-gate
// failures to Opus -> normalize -> reconcile to the cent), then writes the redacted reconciled
// fixture to batth-ingestion/extracted/bills/<source-stem>.json. It does NOT persist - loading is
// delegated to load-batth-full.ts so the whole farm rebuilds atomically and idempotently.
//
// The ±1 cent reconciliation gate (src/lib/energy/reconcile.ts) is the accuracy guarantee: any
// period whose line items do not sum to the printed total lands `needs_review` and renders as
// REVIEW downstream - never a fabricated billed dollar. Logs only { saId, pageType, reason } - never
// the gateway key, grower PII, or bill bytes (AC5).
//
// Run (from apps/dashboard):
//   npm run extract:bills            # all PDFs, 2 in flight
//   npx tsx scripts/extract-bills-batch.ts --pdf-concurrency 3
//   npx tsx scripts/extract-bills-batch.ts --limit 2        # smoke test the path on 2 PDFs
//   npx tsx scripts/extract-bills-batch.ts --force          # re-extract even if the JSON exists

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  coverageTally,
  type ExtractLog,
  runExtraction,
  toFixture,
} from "@/lib/extract/import";
import { createGatewayReader, hasGatewayKey } from "@/lib/extract/reader";

/** Load KEY=VALUE pairs from an env file into process.env (does not overwrite existing). */
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

/** Walk up from cwd until the monorepo root (the dir that holds BatthData/ + package-lock.json). */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "package-lock.json")) && existsSync(join(dir, "BatthData"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate repo root (BatthData/) walking up from ${process.cwd()}`);
}

type Args = {
  force: boolean;
  pdfConcurrency: number;
  limit: number | null;
  only: Set<string> | null;
  outDir: string | null;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { force: false, pdfConcurrency: 2, limit: null, only: null, outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--pdf-concurrency") out.pdfConcurrency = Math.max(1, Number(argv[++i] ?? "2"));
    else if (a === "--limit") out.limit = Math.max(1, Number(argv[++i] ?? "0")) || null;
    // --only stem1,stem2 : restrict to these PDF stems (for the regex-fallback pass).
    else if (a === "--only") out.only = new Set((argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    // --out-dir <path> : write fixtures somewhere other than the load dir (keeps fallback extracts
    //   out of batth-ingestion/extracted/bills so they are merged, not double-loaded).
    else if (a === "--out-dir") out.outDir = argv[++i] ?? null;
  }
  return out;
}

/** Bounded-concurrency map: at most `limit` tasks in flight (PDF-level fan-out). */
async function boundedMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** The committed-fixture shape (toFixture output) we read back for the corpus report. */
type Fixture = ReturnType<typeof toFixture>;

type PdfOutcome = {
  stem: string;
  ok: boolean;
  skipped: boolean;
  error?: string;
  fixture?: Fixture;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main(): Promise<void> {
  loadEnv(".env");
  loadEnv(".env.local");

  if (!hasGatewayKey()) {
    console.error(
      "[extract:bills] No AI Gateway key. Set VERCEL_AI_SDK_API_KEY (or AI_GATEWAY_API_KEY) in apps/dashboard/.env.local.",
    );
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const root = findRepoRoot();
  const INPUT_DIR = join(root, "BatthData", "NewPDFS");
  const OUT_DIR = args.outDir
    ? (args.outDir.startsWith("/") ? args.outDir : join(root, args.outDir))
    : join(root, "batth-ingestion", "extracted", "bills");
  const REPORTS_DIR = join(root, "batth-ingestion", "reports");
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });

  let pdfs = readdirSync(INPUT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (args.only) pdfs = pdfs.filter((f) => args.only!.has(f.replace(/\.pdf$/i, "")));
  if (args.limit) pdfs = pdfs.slice(0, args.limit);

  console.log(
    `[extract:bills] ${pdfs.length} PDFs from ${INPUT_DIR}\n` +
      `[extract:bills] out=${OUT_DIR} pdfConcurrency=${args.pdfConcurrency} force=${args.force}`,
  );

  const sonnet = createGatewayReader("anthropic/claude-sonnet-4-6");
  const opus = createGatewayReader("anthropic/claude-opus-4-8");

  let done = 0;
  const outcomes = await boundedMap(pdfs, args.pdfConcurrency, async (file): Promise<PdfOutcome> => {
    const stem = file.replace(/\.pdf$/i, "");
    const outPath = join(OUT_DIR, `${stem}.json`);

    if (existsSync(outPath) && !args.force) {
      try {
        const fixture = JSON.parse(readFileSync(outPath, "utf8")) as Fixture;
        done += 1;
        console.log(`[extract:bills] (${done}/${pdfs.length}) skip ${stem} (already extracted)`);
        return { stem, ok: true, skipped: true, fixture };
      } catch {
        // unreadable existing output -> fall through and re-extract
      }
    }

    const log: ExtractLog = (e) =>
      console.log(`[extract:bills] ${stem} sa=${e.saId ?? "-"} type=${e.pageType ?? "-"} ${e.reason}`);
    try {
      const pdf = readFileSync(join(INPUT_DIR, file));
      const bytes = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
      const result = await runExtraction(bytes, {
        reader: sonnet,
        escalateReader: opus,
        concurrency: 6,
        log,
      });
      const fixture = toFixture(result);
      writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
      done += 1;
      const tally = coverageTally(result);
      console.log(
        `[extract:bills] (${done}/${pdfs.length}) ${stem} acct=${result.accountNumber ?? "?"} ` +
          `pages=${result.pages} reconciled=${tally.reconciled} review=${tally.needs_review} ` +
          `nem=${result.nem.length} total=${dollars(result.accountPrintedTotalCents ?? 0)}`,
      );
      return { stem, ok: true, skipped: false, fixture };
    } catch (err) {
      done += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[extract:bills] (${done}/${pdfs.length}) FAILED ${stem}: ${msg}`);
      return { stem, ok: false, skipped: false, error: msg };
    }
  });

  // ---- Corpus report (no PII beyond what is already in the committable fixtures) -----------
  const accounts = new Set<string>();
  const sas = new Set<string>();
  let reconciledPeriods = 0;
  let reviewPeriods = 0;
  let dollarsReconciled = 0;
  const periodSources = new Map<string, string[]>(); // (saId|start|close) -> [stem...]
  const noAccount: string[] = [];
  const failed: Array<{ stem: string; error: string }> = [];

  for (const o of outcomes) {
    if (!o.ok || !o.fixture) {
      if (o.error) failed.push({ stem: o.stem, error: o.error });
      continue;
    }
    const f = o.fixture;
    if (f.account.number) accounts.add(f.account.number);
    else noAccount.push(o.stem);
    for (const bill of f.bills) {
      sas.add(bill.saId);
      for (const p of bill.periods) {
        if (p.coverageState === "reconciled") {
          reconciledPeriods += 1;
          dollarsReconciled += p.printedTotalCents;
        } else {
          reviewPeriods += 1;
        }
        const key = `${bill.saId}|${p.start}|${p.close}`;
        periodSources.set(key, [...(periodSources.get(key) ?? []), o.stem]);
      }
    }
  }

  const duplicates = [...periodSources.entries()]
    .filter(([, stems]) => stems.length > 1)
    .map(([key, stems]) => ({ key, stems }));

  const report = {
    generated: "batch-extract",
    inputDir: INPUT_DIR,
    pdfs: pdfs.length,
    extracted: outcomes.filter((o) => o.ok && !o.skipped).length,
    skipped: outcomes.filter((o) => o.skipped).length,
    failed,
    distinctAccounts: accounts.size,
    distinctSAs: sas.size,
    reconciledPeriods,
    reviewPeriods,
    dollarsReconciledCents: dollarsReconciled,
    pdfsWithNoAccount: noAccount,
    duplicatePeriods: duplicates,
  };
  const reportPath = join(REPORTS_DIR, "batch_extract_report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `\n[extract:bills] === CORPUS ===\n` +
      `  PDFs: ${report.pdfs} (extracted ${report.extracted}, skipped ${report.skipped}, failed ${failed.length})\n` +
      `  distinct accounts: ${report.distinctAccounts} | distinct SAs: ${report.distinctSAs}\n` +
      `  periods: ${reconciledPeriods} reconciled, ${reviewPeriods} needs_review\n` +
      `  reconciled dollars: ${dollars(dollarsReconciled)}\n` +
      `  duplicate (saId,start,close) across PDFs: ${duplicates.length}\n` +
      `  PDFs with no account#: ${noAccount.length}\n` +
      `  report -> ${reportPath}`,
  );
  if (failed.length) {
    console.log(`[extract:bills] failed PDFs (re-run without --force to retry): ${failed.map((f) => f.stem).join(", ")}`);
  }
}

main().catch((err: unknown) => {
  console.error("[extract:bills] fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
