// READ-ONLY: run the REAL calendar selectors against the live Sundance demo data to
// confirm the "Billing cycle closes" card is fixed. Run from apps/dashboard.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadMeterReadSchedule } from "@/lib/pge/schedule-load";
import { nextCloses, defaultCalendarMonth, calendarMonth, anyResolvableSerial } from "@/lib/dashboard/calendar";
import type { MeterView } from "@/lib/dashboard/load";

function supabaseUnpooled(): string {
  const txt = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = txt.match(/^DATABASE_URL_UNPOOLED="?([^"\n]+)"?/m);
  if (!m) throw new Error("no DATABASE_URL_UNPOOLED");
  return m[1]!;
}

const TODAY = "2026-06-25";
const FARM_NAME = "Sundance Valley Farms";

async function main() {
  const schedule = loadMeterReadSchedule();
  const prisma = new PrismaClient({ datasourceUrl: supabaseUnpooled() });
  try {
    const farm = await prisma.farm.findFirst({ where: { name: FARM_NAME }, select: { id: true } });
    if (!farm) throw new Error("no farm");
    const pumps = await prisma.pump.findMany({
      where: { farmId: farm.id },
      select: { id: true, name: true, serialCode: true, ranch: { select: { name: true } },
        billingPeriods: { select: { start: true, close: true, peakKw: true } } },
    });
    const meters = pumps.map((p) => ({
      id: p.id, name: p.name, serialCode: p.serialCode, ranchName: p.ranch?.name ?? null,
      periods: p.billingPeriods.map((b) => ({ start: b.start.toISOString(), close: b.close.toISOString(), peakKw: b.peakKw })),
    })) as unknown as MeterView[];

    const nc = nextCloses(meters, schedule, TODAY);
    console.log(`today=${TODAY}  meters=${meters.length}`);
    console.log(`anyResolvableSerial=${anyResolvableSerial(meters, schedule)}`);
    console.log("KPI strip:");
    console.log(`  CLOSING THIS WEEK : ${nc.closingThisWeek}`);
    console.log(`  CLOSING THIS MONTH: ${nc.closingThisMonth}`);
    console.log(`  RUNNING HOT       : ${nc.hotCount}`);
    console.log(`  cannot forecast   : ${nc.unforecastable}   <- was 150`);
    console.log(`  soonest close     : ${nc.soonest?.closeIso} (${nc.soonest?.meterName})`);

    const dm = defaultCalendarMonth(meters, TODAY);
    console.log(`\ndefault calendar month: ${dm.year}-${String(dm.month).padStart(2, "0")}`);
    for (const [y, m, label] of [[2026, 5, "May"], [2026, 6, "Jun (this month)"]] as const) {
      const model = calendarMonth(meters, y, m, schedule);
      const daysWithMarks = model.days.filter((d) => d.chips.length > 0).length;
      console.log(`  ${label}: ${model.actualCount} billed-close marks + ${model.scheduledCount} scheduled marks across ${daysWithMarks} days`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main();
