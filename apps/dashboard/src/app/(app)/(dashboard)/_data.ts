import { cache } from "react";
import { prisma } from "@/lib/db";
import { dashboardFarm, demoFarm, type DashboardFarm } from "@/lib/onboarding/farm";
import { loadFindings, type FindingView } from "@/lib/dashboard/findings";
import { loadMetersForFarm, type MeterView } from "@/lib/dashboard/load";
import {
  loadBillDisputeCards,
  type BillDisputeCardView,
} from "@/lib/agents/agents/bill-audit/load";

// Request-scoped read cache for the dashboard shell. The (dashboard) LAYOUT and the PAGE
// it wraps (Home or Energy) both need the same farm + findings on every navigation, and the
// database is REMOTE (Neon), so each duplicate query is a full network round-trip. Wrapping
// these in React `cache()` dedupes them within a single server request: the farm is resolved
// once, the findings once, the meters once, no matter how many components ask. Keys are the
// primitive args (userId, demoOnly, farmId), so memoization is exact. This, plus the lighter
// Home surface and the memoized fixture reads, is the Home<->Energy latency fix (#9).

/**
 * The dashboard farm for this request. `demoOnly` (the public Tour) pins to the demo;
 * otherwise owner-scoped on `userId` (their own farm, or null -> onboarding). Cached so the
 * layout's gate check and the page's render share one resolution.
 */
export const resolveFarm = cache(
  (userId: string | null, demoOnly: boolean): Promise<DashboardFarm | null> =>
    demoOnly ? demoFarm(prisma) : dashboardFarm(prisma, userId),
);

/** The farm's pending findings, resolved once per request (rail, sheet, Home, drawer share it). */
export const resolveFindings = cache(
  (farmId: string): Promise<FindingView[]> => loadFindings(prisma, farmId),
);

/** The farm's meters projected to MeterView[], resolved once per request. */
export const resolveMeters = cache(
  (farmId: string): Promise<MeterView[]> => loadMetersForFarm(prisma, farmId),
);

/** The farm's surfacing bill-dispute agent cards (proposed + ready-to-download packets),
 *  resolved once per request so Home can place a dispute card beside its bill-audit finding. */
export const resolveBillDisputeCards = cache(
  (farmId: string): Promise<BillDisputeCardView[]> => loadBillDisputeCards(prisma, farmId),
);
