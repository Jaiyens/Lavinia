// Dev/admin runner: land a PG&E "Download My Data" / Share My Data usage export onto a
// farm. Accepts a single CSV/XML file or a directory of them (the historical pull and
// the daily subscription both split per account + service agreement, so a directory is
// the common case). Usage-only: each meter lands its 15-minute UsageIntervals (import +
// export streams) and stays "no_bill" until a scanned bill reconciles dollars.
//
// Run:
//   npx tsx scripts/import-pge-download.ts --farm <farmId> --export ./pge_download/
//   npx tsx scripts/import-pge-download.ts --farm <farmId> --export ./historical.csv
//
// Pair with scripts/validate_pge_export.py first to confirm coverage/granularity before
// importing. Logs service ids only, never grower PII or raw bytes.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { importDownloadMyData } from "@/lib/greenbutton/import";

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Collect .csv/.xml files: the path itself if a file, else every match under a directory. */
function collectFiles(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return [path];
  const out: string[] = [];
  for (const name of readdirSync(path, { recursive: true }) as string[]) {
    const ext = extname(name).toLowerCase();
    if (ext === ".csv" || ext === ".xml") out.push(join(path, name));
  }
  return out.sort();
}

async function main(): Promise<void> {
  loadEnv(".env");
  loadEnv(".env.local");

  const farmId = arg("farm");
  const exportPath = arg("export");
  const format = arg("format") as "csv" | "xml" | undefined;
  if (!farmId || !exportPath) {
    console.error("usage: import-pge-download.ts --farm <farmId> --export <file-or-dir> [--format csv|xml]");
    process.exitCode = 1;
    return;
  }

  const files = collectFiles(exportPath);
  if (files.length === 0) {
    console.error(`[import] no .csv/.xml files found at ${exportPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[import] ${files.length} file(s) -> farm ${farmId}`);

  const prisma = new PrismaClient();
  const total = { pumpsCreated: 0, pumpsUpdated: 0, intervals: 0, billingPeriods: 0, metersFailed: 0 };
  try {
    for (const file of files) {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      const result = await importDownloadMyData(prisma, { content, farmId, format });
      total.pumpsCreated += result.pumpsCreated;
      total.pumpsUpdated += result.pumpsUpdated;
      total.intervals += result.intervals;
      total.billingPeriods += result.billingPeriods;
      total.metersFailed += result.metersFailed;
      console.log(
        `[import] ${file}: meters=${result.serviceIds.length} ` +
          `created=${result.pumpsCreated} updated=${result.pumpsUpdated} ` +
          `intervals=${result.intervals} skipped=${result.metersSkipped} failed=${result.metersFailed}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log("[import] TOTAL", total);
}

main().catch((err: unknown) => {
  console.error("[import] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
