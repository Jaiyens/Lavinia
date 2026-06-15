// Bill-photo onboarding fallback. A farmer who cannot connect Share My Data can
// photograph a PG&E bill; we read the serial code, rate schedule, and billing/cycle
// code off it and pre-fill the manual form. v1 is a stubbed boundary returning a
// committed sample result (zero external calls); the interface is the real one, so
// wiring vision later does not touch any caller. Server-side (fs).

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** What vision extracts from a photographed PG&E bill. Any field may be missing. */
export type BillScanResult = {
  accountName: string | null;
  /** PG&E service ID / ESPI UsagePoint. */
  serviceId: string | null;
  meterSerial: string | null;
  /** Rate schedule, e.g. "AG-C". */
  rateSchedule: string | null;
  /** Meter-read / billing cycle code that drives the cycle close, e.g. "MR-14". */
  billingSerial: string | null;
  /** Service address, for the rough map pin. */
  address: string | null;
};

/** The uploaded image. v1 ignores the bytes; the real model will read them. */
export type BillPhotoInput = {
  filename?: string;
  contentType?: string;
  bytes?: Uint8Array;
};

function loadSampleBill(): BillScanResult {
  // Resolved from the project root so it works in Next's bundled server runtime as
  // well as Vitest/tsx (see the note in source.ts). Shipped via next.config.ts.
  const path = join(process.cwd(), "fixtures", "onboarding", "sample-bill.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    accountName: str(raw.accountName),
    serviceId: str(raw.serviceId),
    meterSerial: str(raw.meterSerial),
    rateSchedule: str(raw.rateSchedule),
    billingSerial: str(raw.billingSerial),
    address: str(raw.address),
  };
}

/**
 * Read a photographed PG&E bill into structured fields. v1 returns a committed
 * sample so the flow is walkable offline.
 *
 * TODO: send `image.bytes` to Claude vision via the Vercel AI Gateway and parse the
 * fields from its structured output. The signature stays the same.
 */
export async function readBillPhoto(
  _image?: BillPhotoInput,
): Promise<BillScanResult> {
  return loadSampleBill();
}
