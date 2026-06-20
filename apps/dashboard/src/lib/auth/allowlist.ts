// The pre-launch access lockdown (memory: prelaunch-access-lockdown). Before app.tryterra.ai
// is public, sign-in is restricted to an allowlist of emails (investors + the first growers).
//
// CRUCIAL SAFETY DEFAULT: the lockdown is OFF unless `ACCESS_ALLOWLIST` is set. With it unset
// or empty, sign-in is open exactly as before, so enabling this module changes NOTHING for the
// founders or local dev until the env var is configured. Turning the lockdown on is a one-line
// env change, never a code deploy.
//
// This module stays DB-free and edge-safe so it is trivially unit-testable. Phase 3 layers the
// "OR an invited teammate" rule (an active FarmMembership / pending FarmInvite) on top, in the
// signIn callback where prisma is available - it is NOT done here.

import { normalizeEmail } from "@/lib/email-normalize";

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

/** Whether the lockdown is active (i.e. an allowlist is configured). */
export function isLockdownOn(raw: string | undefined = process.env.ACCESS_ALLOWLIST): boolean {
  return parseAllowlist(raw).size > 0;
}

/**
 * Whether this email may sign in based on the STATIC allowlist alone.
 * - lockdown off (no allowlist configured) -> always true (open sign-in, unchanged behavior)
 * - lockdown on  -> true only if the normalized email is on the list
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
  if (allowlist.size === 0) return true; // lockdown off
  if (!email) return false;
  return allowlist.has(normalizeEmail(email));
}
