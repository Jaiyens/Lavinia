// Boot-time guardrail for the production access lockdown.
//
// `isStaticallyAllowed` now FAILS CLOSED in production when ACCESS_ALLOWLIST is unset, so a
// deploy that forgets the env var would silently deny ALL sign-in (no one can log in unless
// they already hold farm access). This logs a loud warning at server start so the misconfig
// surfaces in the deploy logs immediately, instead of being discovered at the first failed
// login. The real fix is operational: set ACCESS_ALLOWLIST on the Vercel project.
export function register(): void {
  const isProd =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const hasAllowlist = Boolean(process.env.ACCESS_ALLOWLIST && process.env.ACCESS_ALLOWLIST.trim());
  if (isProd && !hasAllowlist) {
    console.error(
      "[access] ACCESS_ALLOWLIST is not set in production. Sign-in fails closed, so no one " +
        "can sign in unless they already have farm access. Set ACCESS_ALLOWLIST on the Vercel " +
        "project (founders + the pilot grower) before going live.",
    );
  }
}
