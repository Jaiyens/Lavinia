/**
 * Feature + runtime gates for Almond's from-scratch document generation (the "Almond writes the report
 * code, a sandbox runs it" path). These are READ-ONLY env probes, mirroring the `pgeProvider()`
 * convention (src/lib/onboarding/farm.ts) and the gateway's `hasGatewayKey()` (src/lib/ai/gateway.ts):
 * each call re-reads the env, never logs a value, never constructs a client.
 *
 * As of the from-scratch rework this is the DEFAULT generation path (not an experimental escape hatch):
 * the model authors the spreadsheet/report code each turn so the grower gets full styling freedom. It
 * has two external dependencies — the AI Gateway (the model writes the code) AND a code RUNTIME that
 * executes it. The runtime is EITHER a Vercel Sandbox (prod) OR a local Python subprocess (dev/CI with
 * the libraries installed). The factory (src/lib/almond/tools.ts) hands the codegen skills to the model
 * only when the flag + gateway key + a usable runtime are all present, so:
 *   - CI (no gateway key) never registers the skill -> the "zero external calls in CI" law holds (the
 *     build/typecheck/test pass without ever spawning a runtime), and the offline stub's deterministic
 *     builder serves any file ask instead (the silent last-resort fallback), and
 *   - the model is never handed a skill it cannot fulfil (capability-by-omission, ADR-A08).
 */

/**
 * Whether the from-scratch codegen path is enabled. Default ON: it is disabled only by an explicit
 * `ALMOND_CODEGEN_EXPORTS=false`. (It still requires a gateway key + a runtime via
 * `isCodegenExportAvailable`, so flipping this on alone never reaches a sandbox in a bare CI env.)
 */
export function isCodegenExportEnabled(): boolean {
  return process.env.ALMOND_CODEGEN_EXPORTS !== "false";
}

/**
 * Whether Vercel Sandbox credentials are resolvable. On a Vercel deploy the OIDC token is auto-injected
 * (`VERCEL_OIDC_TOKEN`); locally the engineer sets the explicit triple (`vercel env pull` provides the
 * OIDC token, or a personal token + team + project). With neither, `Sandbox.create()` cannot
 * authenticate, so the Vercel runtime is unavailable.
 */
export function hasSandboxCreds(): boolean {
  const explicit =
    Boolean(process.env.VERCEL_TOKEN) &&
    Boolean(process.env.VERCEL_TEAM_ID) &&
    Boolean(process.env.VERCEL_PROJECT_ID);
  return explicit || Boolean(process.env.VERCEL_OIDC_TOKEN);
}

/**
 * The pre-built sandbox snapshot id (python3.13 + WeasyPrint + openpyxl + the Terra fonts already
 * installed). Built once by `scripts/codegen-sandbox-snapshot.ts` and set per-env as
 * `ALMOND_CODEGEN_SNAPSHOT_ID`. Required for the VERCEL runtime so there is NEVER a per-request install
 * (lower latency, no runtime supply-chain surface). Null/absent disables the Vercel runtime.
 */
export function codegenSnapshotId(): string | null {
  const id = process.env.ALMOND_CODEGEN_SNAPSHOT_ID;
  return id && id.trim() !== "" ? id : null;
}

/**
 * Whether the LOCAL Python-subprocess runtime is opted in. Off by default and intended for dev: the
 * engineer must set `ALMOND_CODEGEN_LOCAL=true` AND have a `python3` on PATH with `openpyxl` (xlsx) and
 * `weasyprint` (pdf) installed. The model-authored python runs in an isolated temp dir with a timeout
 * (src/lib/almond/codegen/local-run.ts); it is NOT a security boundary as strong as the Vercel microVM,
 * so prod always prefers the Vercel runtime (see `codegenRuntime`).
 */
export function isLocalRuntimeEnabled(): boolean {
  return process.env.ALMOND_CODEGEN_LOCAL === "true";
}

/** The resolved code runtime for the from-scratch path. Vercel Sandbox wins when configured (the strong
 *  isolation boundary, used in prod); the local subprocess is the dev/CI opt-in; otherwise none. */
export type CodegenRuntime = "vercel" | "local" | "none";

export function codegenRuntime(): CodegenRuntime {
  if (hasSandboxCreds() && codegenSnapshotId() !== null) return "vercel";
  if (isLocalRuntimeEnabled()) return "local";
  return "none";
}

/**
 * The single composite gate the factory uses: the flag is on, a gateway key is present (the model can
 * write the code), AND a runtime can execute it. If any is missing the codegen skills are withheld and
 * the deterministic offline builder serves the grower instead — so a half-configured environment
 * degrades to a plain file rather than a runtime throw.
 */
export function isCodegenExportAvailable(hasGatewayKey: boolean): boolean {
  return isCodegenExportEnabled() && hasGatewayKey && codegenRuntime() !== "none";
}
