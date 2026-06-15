// The fs half of the meter-read schedule (Story 3.5): reads and validates the
// committed fixture. Server-only (node:fs); the pure lookups live in
// schedule.ts. process.cwd() per the Vercel rule; fixtures ship via the "/**"
// outputFileTracingIncludes glob from 3.2.

import fs from "node:fs";
import path from "node:path";
import type { MeterReadSchedule } from "./schedule";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read and validate fixtures/pge-meter-read-schedule.json. Throws on a malformed file. */
export function loadMeterReadSchedule(): MeterReadSchedule {
  const file = path.join(process.cwd(), "fixtures", "pge-meter-read-schedule.json");
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("pge-meter-read-schedule.json: not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.year !== "number") {
    throw new Error("pge-meter-read-schedule.json: missing numeric year");
  }
  if (typeof obj.cycles !== "object" || obj.cycles === null) {
    throw new Error("pge-meter-read-schedule.json: missing cycles map");
  }
  const cycles: Record<string, string[]> = {};
  for (const [code, dates] of Object.entries(obj.cycles as Record<string, unknown>)) {
    if (!Array.isArray(dates) || dates.length !== 12) {
      throw new Error(`pge-meter-read-schedule.json: cycle ${code} must carry 12 dates`);
    }
    let prev = "";
    for (const d of dates) {
      if (typeof d !== "string" || !ISO_DATE.test(d)) {
        throw new Error(`pge-meter-read-schedule.json: cycle ${code} has a non-ISO date`);
      }
      // nextCycleClose scans first-match; the table must be ascending or the
      // scan returns a date that is not the next one. Guard the invariant here.
      if (prev !== "" && d <= prev) {
        throw new Error(`pge-meter-read-schedule.json: cycle ${code} dates not ascending`);
      }
      prev = d;
    }
    cycles[code] = dates as string[];
  }
  return {
    year: obj.year,
    mayShiftNote: typeof obj.mayShiftNote === "string" ? obj.mayShiftNote : null,
    cycles,
  };
}

