import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { canAccessFarm } from "./access";
import { accessibleFarms } from "@/lib/onboarding/farm";

// The active-farm selection for a user who belongs to more than one farm. The id lives in an
// httpOnly cookie, but it is NEVER trusted on its own: this reader re-checks membership on every
// call, so a forged or stale value (a farm the user was removed from, or never belonged to) is
// silently ignored and we fall back to the user's default farm. The cookie is set only through
// setActiveFarmAction, which validates access before writing.

export const ACTIVE_FARM_COOKIE = "terra_active_farm";

/**
 * The validated active-farm id for this request, or null when the user can open no farm.
 * The ONLY reader of the cookie. Read it ONCE per request (the dashboard caches it) and thread
 * it explicitly into resolveFarm/currentFarm - never read cookies() inside those resolvers, or
 * the request-scoped memo would collide across farms.
 */
export async function activeFarmId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  let candidate: string | null = null;
  try {
    const store = await cookies();
    candidate = store.get(ACTIVE_FARM_COOKIE)?.value ?? null;
  } catch {
    // Called outside a request scope (e.g. a route handler invoked directly in a test): there is
    // no cookie store, so there is no selection to honor - fall through to the default farm.
    candidate = null;
  }
  // Trust the cookie only if the user still has access to that farm.
  if (candidate && (await canAccessFarm(prisma, candidate, userId))) return candidate;
  // Fall back to the user's default farm (newest membership). currentFarm independently applies
  // the "ready" check, so even a non-ready default self-corrects to the newest ready farm there.
  const farms = await accessibleFarms(prisma, userId);
  return farms[0]?.id ?? null;
}
