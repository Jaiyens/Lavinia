// The sign-in allowlist (pre-launch access gate). Sign-in itself (Google SSO + emailed
// magic link) is fully wired in lib/auth.ts; this module decides WHICH emails are allowed
// to complete it, so we can hand a specific grower's manager a working sign-in without
// opening app.tryterra.ai to the whole public.
//
// The list is read from the AUTH_ALLOWLIST env var (comma-separated emails), NOT from git,
// so adding the manager's address is a one-line Vercel env edit with no code change and no
// secret committed. Matching is case-insensitive and trimmed.
//
// FAIL CLOSED. When AUTH_ALLOWLIST is unset or empty, NO email is allowed (every sign-in is
// rejected). That is deliberate: a forgotten or mistyped env var must lock the doors, never
// throw them open. To go fully public later, set AUTH_ALLOWLIST="*".
//
// Pure + dependency-free on purpose (no env read, no Prisma, no NextAuth import) so it is
// unit-testable and edge-safe; the env read happens in the caller (auth.config.ts).

/** The wildcard that opens sign-in to every email. Set AUTH_ALLOWLIST="*" to use it. */
const ALLOW_ALL = "*";

/**
 * Parse a raw AUTH_ALLOWLIST value into a normalized set of allowed emails. Splits on
 * commas, trims, lowercases, and drops blanks. An undefined/blank input yields an empty set
 * (which `isEmailAllowed` then treats as "allow no one").
 */
export function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Is this email cleared to sign in?
 *  - allowlist contains "*"        -> everyone is allowed (intentional public launch).
 *  - email is in the allowlist     -> allowed.
 *  - otherwise (incl. empty list)  -> denied (fail closed).
 * A missing/blank email is always denied.
 */
export function isEmailAllowed(
  email: string | null | undefined,
  allowlist: Set<string>,
): boolean {
  if (allowlist.has(ALLOW_ALL)) return true;
  if (!email) return false;
  return allowlist.has(email.trim().toLowerCase());
}
