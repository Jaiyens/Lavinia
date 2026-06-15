// Admin/dev runner for Story 1.8: run the end-to-end bill import on the one real demo account
// (PG&E account 4699664587-8, Charanjit S Batth Farms), LIVE via the Vercel AI Gateway. This is
// the one sanctioned external-call path; it is NOT run in dev/CI (those read the committed
// fixture this script writes). Run: `npm run import:demo`.
//
// It loads the gateway key from the env (.env.local: VERCEL_AI_SDK_API_KEY, or AI_GATEWAY_API_KEY),
// splits the scanned PDF, classifies + extracts each page on Sonnet (escalating cent-gate failures
// to Opus), normalizes + reconciles to the cent, writes the redacted reconciled fixture, and
// persists the reconciled bills to the dev DB. Logs only { saId, pageType, reason } - never the
// key, grower PII, or bill bytes (AC5).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  coverageTally,
  type ExtractLog,
  persistExtraction,
  runExtraction,
  toFixture,
} from "@/lib/extract/import";
import { createGatewayReader } from "@/lib/extract/reader";

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

const ACCOUNT_NUMBER = "4699664587-8";
const PDF_PATH = "docs/BatthFarmAccountPdf.pdf";
const FIXTURE_PATH = "fixtures/extract/batth-account-4699664587.json";

async function main(): Promise<void> {
  loadEnv(".env");
  loadEnv(".env.local");

  const pdf = readFileSync(join(process.cwd(), PDF_PATH));
  const bytes = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  console.log(`[import] read ${PDF_PATH} (${pdf.byteLength} bytes)`);

  const log: ExtractLog = (event) =>
    console.log(`[extract] sa=${event.saId ?? "-"} type=${event.pageType ?? "-"} ${event.reason}`);

  const sonnet = createGatewayReader("anthropic/claude-sonnet-4-6");
  const opus = createGatewayReader("anthropic/claude-opus-4-8");

  const result = await runExtraction(bytes, {
    reader: sonnet,
    escalateReader: opus,
    concurrency: 6,
    log,
  });

  console.log(
    `[import] pages=${result.pages} reconciled=${result.reconciledCount}/${result.bills.length} ` +
      `escalated=${result.escalatedCount} nem=${result.nem.length} needsReview=${result.needsReview.length}`,
  );
  console.log("[import] coverage", coverageTally(result));
  console.log("[import] accountPrintedTotalCents", result.accountPrintedTotalCents);

  writeFileSync(join(process.cwd(), FIXTURE_PATH), `${JSON.stringify(toFixture(result), null, 2)}\n`);
  console.log(`[import] wrote ${FIXTURE_PATH}`);

  const prisma = new PrismaClient();
  try {
    const counts = await persistExtraction(result, prisma, {
      farmName: "Batth Farms",
      accountNumber: result.accountNumber ?? ACCOUNT_NUMBER,
      isDemo: false,
    });
    console.log("[import] persisted", counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[import] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
