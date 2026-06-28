// Shared resolvers for the Almond Logic portal screens. Each screen page calls resolveAlmondFarm()
// to get the operator's OWN farm (same gating as the rest of the dashboard), then resolveContext()
// to pick the active huller + crop year from the URL search params (defaulting to the first huller
// and its latest crop year). Keeps every screen consistent with the sidebar selection.

import { sessionUserId } from "@/lib/auth";
import type { HullerInfo } from "@/lib/almond-portal/data";
import { resolveActiveFarmId, resolveFarm } from "../_data";

/** The signed-in operator's own farm, or null. */
export async function resolveAlmondFarm() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  return resolveFarm(userId, activeId, false);
}

export type AlmondContext = { hullerId: number | null; cropYear: number | null };

/** The active huller + crop year from the URL, defaulting to the first huller and its latest year. */
export function resolveContext(
  sp: { hullerId?: string; cropYear?: string },
  hullers: HullerInfo[],
): AlmondContext {
  const fromUrl = sp.hullerId ? Number(sp.hullerId) : null;
  const hullerId = fromUrl ?? hullers[0]?.id ?? null;
  const active = hullers.find((h) => h.id === hullerId) ?? hullers[0] ?? null;
  const cropYear = sp.cropYear ? Number(sp.cropYear) : active?.cropYears[0] ?? null;
  return { hullerId, cropYear };
}
