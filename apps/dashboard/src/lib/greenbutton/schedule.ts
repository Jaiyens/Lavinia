// PG&E meter-read schedule: the table that turns a pump's billing/meter-read
// cycle code (Pump.billingSerial) into its scheduled read dates, and from there
// its billing-cycle close. This is the fs-backed loader (server-side); the date
// math itself is pure and lives in src/lib/energy/billing.ts. Mirrors the
// loadSampleFarm pattern in prisma/sample-farm.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { billingCycleFor, closeOnOrAfter } from "@/lib/energy/billing";
import type { BillingCycle } from "@/lib/energy/types";

/** The committed annual schedule: cycle code -> 12 monthly read dates. */
export type MeterReadSchedule = {
  year: number;
  cycles: Record<string, string[]>;
};

/** Read and shape fixtures/pge-meter-read-schedule.json. */
export function loadMeterReadSchedule(): MeterReadSchedule {
  // Resolve from process.cwd(), NOT new URL(..., import.meta.url): the latter
  // points inside .next once bundled (Turbopack/Vercel) and throws at runtime.
  // Matches src/lib/pge/rate-card.ts and src/lib/onboarding/source.ts.
  const file = path.join(process.cwd(), "fixtures", "pge-meter-read-schedule.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    year: number;
    cycles: Record<string, string[]>;
  };
  return { year: raw.year, cycles: raw.cycles };
}

/** Scheduled read dates for a cycle code, or null if the code is unknown. */
export function readDatesForSerial(billingSerial: string): string[] | null {
  return loadMeterReadSchedule().cycles[billingSerial] ?? null;
}

/**
 * The next scheduled meter read on or after `ref` for a pump's billing serial,
 * the cycle close it is heading toward. Null if the code is unknown or `ref` is
 * past the table.
 */
export function closeDateForSerial(
  billingSerial: string,
  ref: string,
): string | null {
  const dates = readDatesForSerial(billingSerial);
  return dates ? closeOnOrAfter(dates, ref) : null;
}

/**
 * The billing cycle (start + close) that contains `ref` for a pump's billing
 * serial. Null if the code is unknown or the window can't be placed.
 */
export function billingCycleForSerial(
  billingSerial: string,
  ref: string,
): BillingCycle | null {
  const dates = readDatesForSerial(billingSerial);
  return dates ? billingCycleFor(dates, ref) : null;
}
