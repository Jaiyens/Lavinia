import { cache } from "react";
import { prisma } from "@/lib/db";
import { dashboardFarm, demoFarm, type DashboardFarm } from "@/lib/onboarding/farm";
import { activeFarmId } from "@/lib/auth/active-farm";
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
 * The validated active-farm id for this request, resolved once. The layout and the page it
 * wraps each ask for it; caching keeps the membership re-check to a single round-trip. Threaded
 * EXPLICITLY into resolveFarm so the farm memo is keyed on it (never read the cookie inside the
 * resolver, or the memo would collide across a user's farms within one request).
 */
export const resolveActiveFarmId = cache(
  (userId: string | null): Promise<string | null> => activeFarmId(userId),
);

/**
 * The dashboard farm for this request. `demoOnly` (the public Tour) pins to the demo; otherwise
 * gated on an active membership of `userId` and the selected `activeFarmId` (their own farm, or
 * null -> onboarding). Cached so the layout's gate check and the page's render share one
 * resolution; the key includes activeFarmId so switching farms re-resolves.
 */
export const resolveFarm = cache(
  (userId: string | null, activeFarmId: string | null, demoOnly: boolean): Promise<DashboardFarm | null> =>
    demoOnly ? demoFarm(prisma) : dashboardFarm(prisma, userId, activeFarmId),
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
