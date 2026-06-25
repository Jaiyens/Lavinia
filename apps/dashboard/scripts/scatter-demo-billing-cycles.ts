// Scatter the Sundance demo farm's billing-cycle close dates across each month, the
// way a real PG&E account looks (Batth). The original seed closed EVERY period on the
// last day of its month and left serialCode null, so the Calendar lens drew one stacked
// "Billed close" dot on the 31st and reported all 150 meters "cannot forecast yet".
//
// This script, run against the Supabase demo DB:
//   1. assigns each pump a real PG&E serial cycle code (spread across the 24 codes in
//      fixtures/pge-meter-read-schedule.json) so it becomes forecastable -> scheduled
//      read marks appear and "closing this week / month" stop reading 0;
//   2. moves each BillingPeriod.close + cycleClose to that code's actual read date for
//      the period's calendar month (exact match from the fixture for the months it
//      covers, else the code's typical read day) so the "Billed close" dots scatter and
//      line up with the scheduled reads, exactly as a real account does.
//
// It NEVER changes dollars: close stays inside the same calendar month (same YYYY-MM),
// so monthly spend rollups and the tuned savings are untouched. Only the day moves.
//
// Deterministic + idempotent: same assignment every run. Safe to re-run.
//
// Usage (from apps/dashboard):
//   npx tsx scripts/scatter-demo-billing-cycles.ts            # DRY RUN: plan + preview
//   npx tsx scripts/scatter-demo-billing-cycles.ts --write    # persist to Supabase
//
// Target DB is read from .env DATABASE_URL_UNPOOLED (Supabase session pooler, 5432). It
// REFUSES anything that is not Supabase, the pooled 6543 endpoint, and local/Neon.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const FARM_NAME = "Sundance Valley Farms";
const WRITE = process.argv.includes("--write");

// --- target guard (mirrors seed-demo-farm.write.ts) -----------------------------------
function supabaseUnpooled(): string {
  const txt = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = txt.match(/^DATABASE_URL_UNPOOLED="?([^"\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL_UNPOOLED not found in apps/dashboard/.env");
  const url = m[1]!;
  if (!/supabase\.com/.test(url)) throw new Error(`REFUSING: target is not Supabase: ${url.replace(/:[^:@/]+@/, ":***@")}`);
  if (/:6543/.test(url)) throw new Error("REFUSING: pooled 6543 endpoint; use the 5432 session pooler");
  if (/127\.0\.0\.1|localhost|neon\.tech/.test(url)) throw new Error("REFUSING: local/Neon target");
  return url;
}

// --- schedule fixture -----------------------------------------------------------------
type Schedule = { year: number; cycles: Record<string, string[]> };
function loadSchedule(): Schedule {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "pge-meter-read-schedule.json"), "utf8"));
  return { year: raw.year, cycles: raw.cycles };
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}
function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Per-code helpers: exact calendar-month read date + a typical read day fallback. */
function buildCodeIndex(schedule: Schedule) {
  const byCode = new Map<string, { monthMap: Map<string, number>; typicalDay: number }>();
  for (const [code, dates] of Object.entries(schedule.cycles)) {
    const monthMap = new Map<string, number>();
    const days: number[] = [];
    for (const d of dates) {
      monthMap.set(d.slice(0, 7), Number(d.slice(8, 10))); // last write wins for a doubled month
      days.push(Number(d.slice(8, 10)));
    }
    byCode.set(code, { monthMap, typicalDay: median(days) });
  }
  return byCode;
}

/** The close day this code reads in the given calendar month: exact, else typical (clamped). */
function closeDayFor(
  index: ReturnType<typeof buildCodeIndex>,
  code: string,
  year: number,
  month1: number,
): number {
  const entry = index.get(code)!;
  const ym = `${year}-${String(month1).padStart(2, "0")}`;
  const exact = entry.monthMap.get(ym);
  const day = exact ?? entry.typicalDay;
  return Math.min(Math.max(day, 1), daysInMonth(year, month1));
}

async function main() {
  const schedule = loadSchedule();
  const codes = Object.keys(schedule.cycles); // 24 codes
  const index = buildCodeIndex(schedule);

  const url = supabaseUnpooled();
  console.log(`[scatter] ${WRITE ? "WRITE" : "DRY RUN"}  target: ${url.replace(/:[^:@/]+@/, ":***@")}`);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const farm = await prisma.farm.findFirst({ where: { name: FARM_NAME }, select: { id: true, isDemo: true } });
    if (!farm) throw new Error(`No farm named "${FARM_NAME}"`);
    if (!farm.isDemo) throw new Error(`REFUSING: farm "${FARM_NAME}" is not isDemo`);
    console.log(`[scatter] farm ${farm.id} (isDemo)`);

    // Stable pump order (by growerPumpId M-001..M-150) -> deterministic code assignment.
    const pumps = await prisma.pump.findMany({
      where: { farmId: farm.id },
      select: { id: true, growerPumpId: true, name: true, billingPeriods: { select: { id: true, close: true } } },
    });
    pumps.sort((a, b) => (a.growerPumpId ?? a.id).localeCompare(b.growerPumpId ?? b.id));

    // Even round-robin over codes -> ~6-7 meters per cycle, every read day populated.
    const codeOfPump = new Map<string, string>();
    pumps.forEach((p, i) => codeOfPump.set(p.id, codes[i % codes.length]!));

    // Build target close date for every period.
    const periodTargets: { id: string; iso: string }[] = [];
    for (const p of pumps) {
      const code = codeOfPump.get(p.id)!;
      for (const period of p.billingPeriods) {
        const iso = period.close.toISOString();
        const year = Number(iso.slice(0, 4));
        const month1 = Number(iso.slice(5, 7));
        const day = closeDayFor(index, code, year, month1);
        periodTargets.push({ id: period.id, iso: `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z` });
      }
    }

    // --- preview: serial distribution + resulting close-day scatter for the demo months ---
    const serialDist = new Map<string, number>();
    for (const c of codeOfPump.values()) serialDist.set(c, (serialDist.get(c) ?? 0) + 1);
    console.log(`\n[scatter] serial codes assigned across ${pumps.length} pumps:`);
    console.log("  " + [...serialDist.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => `${c}:${n}`).join("  "));

    const preview = new Map<string, Map<number, number>>();
    for (const t of periodTargets) {
      const ym = t.iso.slice(0, 7);
      const day = Number(t.iso.slice(8, 10));
      const dm = preview.get(ym) ?? new Map<number, number>();
      dm.set(day, (dm.get(day) ?? 0) + 1);
      preview.set(ym, dm);
    }
    console.log(`\n[scatter] NEW close-day distribution per month (day:count):`);
    for (const ym of [...preview.keys()].sort()) {
      const dm = preview.get(ym)!;
      const days = [...dm.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`);
      console.log(`  ${ym}  (${dm.size} distinct days) -> ${days.join("  ")}`);
    }

    if (!WRITE) {
      console.log(`\nDRY RUN only. Re-run with --write to persist to Supabase.`);
      return;
    }

    // --- write serial codes (grouped) ---
    const pumpsByCode = new Map<string, string[]>();
    for (const [pumpId, code] of codeOfPump) (pumpsByCode.get(code) ?? pumpsByCode.set(code, []).get(code)!).push(pumpId);
    for (const [code, ids] of pumpsByCode) {
      await prisma.pump.updateMany({ where: { id: { in: ids } }, data: { serialCode: code } });
    }
    console.log(`\n[scatter] set serialCode on ${pumps.length} pumps (${pumpsByCode.size} distinct codes)`);

    // --- write close + cycleClose (grouped by identical target date) ---
    const idsByIso = new Map<string, string[]>();
    for (const t of periodTargets) (idsByIso.get(t.iso) ?? idsByIso.set(t.iso, []).get(t.iso)!).push(t.id);
    let done = 0;
    for (const [iso, ids] of idsByIso) {
      const d = new Date(iso);
      await prisma.billingPeriod.updateMany({ where: { id: { in: ids } }, data: { close: d, cycleClose: d } });
      done += ids.length;
    }
    console.log(`[scatter] updated close + cycleClose on ${done} billing periods (${idsByIso.size} distinct dates)`);
    console.log(`\n[scatter] DONE.`);
  } finally {
    await prisma.$disconnect();
  }
}
void main();
