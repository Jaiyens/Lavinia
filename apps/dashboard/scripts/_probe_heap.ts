// TEMP probe: verify the whole-file-string + parseCsv grid heap claim on the real 81MB file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "@/lib/spreadsheet/parse";
import { normalizeDownloadMyDataCsv } from "@/lib/normalize/downloadmydata";

declare const global: { gc?: () => void };
function mb(n: number): number {
  return Math.round(n / 1e6);
}
function snap(label: string): void {
  global.gc?.();
  const m = process.memoryUsage();
  console.log(`${label}: heapUsed ${mb(m.heapUsed)} MB | rss ${mb(m.rss)} MB`);
}

const file = process.argv[2] ?? "../../Historical_20260401-20260430.csv";
snap("baseline");

const csv = readFileSync(join(process.cwd(), file), "utf8");
console.log("file string length (chars):", csv.length, "=> ~", mb(csv.length * 2), "MB UTF-16");
snap("after readFileSync (one string)");

const grid = parseCsv(csv);
console.log("grid rows:", grid.length, "| cols(row1):", grid[1]?.length);
snap("after parseCsv (string[][] grid live)");

// keep csv + grid live, then run the full normalize (the production call)
const meters = normalizeDownloadMyDataCsv(csv);
console.log("meters:", meters.length, "| totalIntervals:",
  meters.reduce((n, m) => n + m.intervals.length, 0));
snap("after normalize (csv+grid+meters live)");

// keep refs alive past the snapshot
console.log("liveness:", grid.length + meters.length + csv.length > 0);
