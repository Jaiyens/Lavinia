// ESPI / Green Button -> NormalizedMeter. Thin: parseGreenButton already yields
// per-UsagePoint usage in our internal units (kWh, USD), so this mapper only widens
// each UsagePoint to the source-agnostic shape. The standard ESPI feed carries no
// physical meter serial and no PG&E account number, so those are null; the energy
// feed is electric, so fuel is "electric".

import { parseGreenButton } from "@/lib/greenbutton/parse";
import type { NormalizedMeter } from "./types";

/** Map a PG&E Green Button / ESPI XML feed to the normalized meter shape. */
export function normalizeEspi(xml: string): NormalizedMeter[] {
  return parseGreenButton(xml).map((up) => ({
    serviceId: up.serviceId,
    meterSerial: null, // not exposed by the standard ESPI usage feed
    accountNumber: null, // not in the standard ESPI feed; arrives via the spreadsheet
    fuel: "electric" as const,
    tariff: up.tariff,
    address: up.address,
    intervals: up.intervals,
    summaries: up.summaries,
  }));
}
