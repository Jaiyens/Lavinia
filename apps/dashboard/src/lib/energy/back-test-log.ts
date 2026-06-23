// The ONE impure sink for reconciliation logging, kept out of the pure energy
// core. Behind TERRA_RECONCILE_LOG so normal operation is silent; flip it to "1"
// during a bill load to get one structured line per meter - computed vs real, the
// absolute and percent error, pass/fail, and the best-guess cause - so a miss is
// visible and traceable to its input rather than silently swallowed.

import type { ReconciliationRecord } from "./back-test-report";

/** True only when the founder has explicitly opted into per-meter reconcile logs. */
function enabled(): boolean {
  return process.env.TERRA_RECONCILE_LOG === "1";
}

/**
 * Emit one reconciliation as a single structured line. No-op unless
 * TERRA_RECONCILE_LOG=1 (read at call time, so flipping the flag needs no
 * rebuild). Every value here is the deterministic engine's own figure; this
 * function reports, it never computes or adjusts.
 */
export function logReconciliation(record: ReconciliationRecord): void {
  if (!enabled()) return;
  console.info(
    "[reconcile]",
    JSON.stringify({
      meter: record.meterId,
      name: record.meterName,
      sa: record.serviceId,
      schedule: record.rateSchedule,
      computedCents: record.computedCents,
      realCents: record.realCents,
      absErrorCents: record.absErrorCents,
      pctError: record.pctError,
      pass: record.pass,
      cause: record.cause,
      cardVersion: record.rateCardVersion,
      cardEffectiveDate: record.cardEffectiveDate,
    }),
  );
}
