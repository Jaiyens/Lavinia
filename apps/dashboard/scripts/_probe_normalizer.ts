// TEMP probe: stress the Download My Data CSV normalizer on the real 80MB export.
// Measures meters/intervals/memory/time and checks identity + DST-transition correctness.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeDownloadMyDataCsv } from "@/lib/normalize/downloadmydata";

const file = process.argv[2] ?? "../../Historical_20260304-20260331.csv";
const t0 = Date.now();
const csv = readFileSync(join(process.cwd(), file), "utf8");
const tRead = Date.now();
const meters = normalizeDownloadMyDataCsv(csv);
const tNorm = Date.now();

const totalIntervals = meters.reduce((n, m) => n + m.intervals.length, 0);
const dirCounts: Record<string, number> = {};
const durCounts: Record<number, number> = {};
let nonMonotonic = 0;
let dupStarts = 0;
for (const m of meters) {
  const seen = new Set<string>();
  let prev = "";
  for (const iv of m.intervals) {
    dirCounts[iv.direction ?? "?"] = (dirCounts[iv.direction ?? "?"] ?? 0) + 1;
    durCounts[iv.durationSec] = (durCounts[iv.durationSec] ?? 0) + 1;
    const key = `${iv.start}|${iv.direction}`;
    if (seen.has(key)) dupStarts += 1;
    seen.add(key);
    if (iv.start < prev) nonMonotonic += 1;
    prev = iv.start;
  }
}
const sample = meters.find((m) => m.intervals.length > 0)!;
const mem = process.memoryUsage();

console.log("file:", file);
console.log("meters:", meters.length, "| totalIntervals:", totalIntervals);
console.log("read ms:", tRead - t0, "| normalize ms:", tNorm - tRead);
console.log("rss MB:", Math.round(mem.rss / 1e6), "| heapUsed MB:", Math.round(mem.heapUsed / 1e6));
console.log("direction counts:", dirCounts);
console.log("durationSec counts:", durCounts);
console.log("non-monotonic interval pairs (sorted, expect 0):", nonMonotonic);
console.log("duplicate (start|direction) within a meter (expect 0):", dupStarts);
console.log("SAMPLE meter.serviceId (raw):", JSON.stringify(sample.serviceId),
  "| accountNumber:", JSON.stringify(sample.accountNumber),
  "| meterSerial:", JSON.stringify(sample.meterSerial),
  "| tariff:", JSON.stringify(sample.tariff));
console.log("SAMPLE first 3 starts:", sample.intervals.slice(0, 3).map((i) => i.start));
// DST transition (March 8 2026 spring-forward): find a 15-min meter and print starts around 09:00-11:00Z
const dst = meters.find((m) => m.intervals.some((i) => i.start.startsWith("2026-03-08") && i.durationSec === 900));
if (dst) {
  const window = dst.intervals
    .filter((i) => i.start >= "2026-03-08T09:00:00.000Z" && i.start <= "2026-03-08T11:30:00.000Z" && i.direction === "import")
    .map((i) => i.start);
  console.log("DST-day import starts 09:00-11:30Z for", dst.serviceId, ":", window);
}