// The pre-launch access lockdown (memory: prelaunch-access-lockdown). Before app.tryterra.ai
// is public, sign-in is restricted to an allowlist of emails (investors + the first growers).
//
// FAIL CLOSED IN PRODUCTION. With `ACCESS_ALLOWLIST` unset or empty, sign-in is OPEN in dev
// and test (so local dev + CI are never locked out) but DENIED in production. The earlier
// "open everywhere when unset" default failed OPEN on the public prod domain: anyone with a
// Google account could sign in. Production now requires the allowlist to be configured before
// anyone may sign in, so a missing env var locks the door instead of leaving it wide open.
// Turning the lockdown on/off is still a one-line env change, never a code deploy.
//
// This module stays DB-free and edge-safe so it is trivially unit-testable. Phase 3 layers the
// "OR an invited teammate" rule (an active FarmMembership / pending FarmInvite) on top, in the
// signIn callback where prisma is available - it is NOT done here.

import { normalizeEmail } from "@/lib/email-normalize";

/** Whether the app is running in production (Vercel prod, or NODE_ENV=production elsewhere).
 *  Used to decide the fail-closed default when no allowlist is configured. */
function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/** Parse `ACCESS_ALLOWLIST` (a comma-separated email list) into a normalized Set. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
      .map(normalizeEmail),
  );
}

/**
 * Whether a static allowlist is CONFIGURED. This is a config predicate, NOT an access decision.
 *
 * It does NOT mean "access is open when false". Since the fail-closed change, an unset/empty
 * allowlist still DENIES sign-in in production (see isStaticallyAllowed). So `isLockdownOn() ===
 * false` only tells you no list was supplied; in prod that means everyone is locked out, in
 * dev/test it means everyone is let in. Never branch on this to infer who may sign in - call
 * isStaticallyAllowed(email) (which is production-aware) for the actual access decision.
 */
export function isLockdownOn(raw: string | undefined = process.env.ACCESS_ALLOWLIST): boolean {
  return parseAllowlist(raw).size > 0;
}

/**
 * Whether this email may sign in based on the STATIC allowlist alone.
 * - no allowlist configured, in production -> false (FAIL CLOSED: the public prod domain
 *   never grants open sign-in just because the env var is missing)
 * - no allowlist configured, in dev/test   -> true (open sign-in so local dev + CI are not
 *   locked out)
 * - allowlist configured -> true only if the normalized email is on the list
 *
 * The signIn callback ORs this with the DB membership/invite check (Phase 3) before denying,
 * and returns a uniform `false` for any denial so the gate cannot be used to enumerate who is
 * allowed.
 */
export function isStaticallyAllowed(
  email: string | null | undefined,
  raw: string | undefined = process.env.ACCESS_ALLOWLIST,
): boolean {
  const allowlist = parseAllowlist(raw);
  // No allowlist configured: fail closed in production, stay open in dev/test.
  if (allowlist.size === 0) return !isProduction();
  if (!email) return false;
  return allowlist.has(normalizeEmail(email));
}
