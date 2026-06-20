/**
 * Feature + capability gates for the code-gen export POC (the long-tail "Almond writes the report
 * markup, a Vercel Sandbox renders it" path). These are READ-ONLY env probes, mirroring the
 * `pgeProvider()` convention (src/lib/onboarding/farm.ts) and the gateway's `hasGatewayKey()`
 * (src/lib/ai/gateway.ts): each call re-reads the env, never logs a value, never constructs a client.
 *
 * The codegen skill has TWO external dependencies — the AI Gateway (the model writes the markup) AND
 * the Vercel Sandbox (renders it). The factory (src/lib/almond/tools.ts) hands the skill to the model
 * only when ALL of the flag + gateway key + sandbox creds + a pre-built snapshot id are present, so:
 *   - dev/CI (no key, no creds) never even registers the skill -> the "zero external calls in CI" law
 *     holds (the build/typecheck/test pass without ever booting a microVM), and
 *   - the model is never handed a skill it cannot fulfil (capability-by-omission, ADR-A08).
 */

/** Whether the code-gen export POC is enabled. Default OFF (owner-only, experimental). */
export function isCodegenExportEnabled(): boolean {
  return process.env.ALMOND_CODEGEN_EXPORTS === "true";
}

/**
 * Whether Vercel Sandbox credentials are resolvable. On a Vercel deploy the OIDC token is auto-injected
 * (`VERCEL_OIDC_TOKEN`); locally the engineer sets the explicit triple (`vercel env pull` provides the
 * OIDC token, or a personal token + team + project). With neither, `Sandbox.create()` cannot
 * authenticate, so the skill must NOT be offered (it would throw at render time) — checked here so the
 * gate is symmetric with the gateway key.
 */
export function hasSandboxCreds(): boolean {
  const explicit =
    Boolean(process.env.VERCEL_TOKEN) &&
    Boolean(process.env.VERCEL_TEAM_ID) &&
    Boolean(process.env.VERCEL_PROJECT_ID);
  return explicit || Boolean(process.env.VERCEL_OIDC_TOKEN);
}

/**
 * The pre-built sandbox snapshot id (WeasyPrint + the Terra fonts already installed). Built once by
 * `scripts/codegen-sandbox-snapshot.ts` and set per-env as `ALMOND_CODEGEN_SNAPSHOT_ID`. Required for
 * the live path so there is NEVER a per-request install (lower latency, no runtime supply-chain
 * surface). Null/absent -> the skill is not offered and the deterministic templates serve every ask.
 */
export function codegenSnapshotId(): string | null {
  const id = process.env.ALMOND_CODEGEN_SNAPSHOT_ID;
  return id && id.trim() !== "" ? id : null;
}

/**
 * The single composite gate the factory uses: every dependency of the codegen path must be present.
 * If any is missing the skill is withheld (and the deterministic export/report skills still serve the
 * grower), so a half-configured environment degrades to today's behavior rather than a runtime throw.
 */
export function isCodegenExportAvailable(hasGatewayKey: boolean): boolean {
  return (
    isCodegenExportEnabled() && hasGatewayKey && hasSandboxCreds() && codegenSnapshotId() !== null
  );
}
