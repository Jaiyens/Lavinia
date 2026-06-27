// The shared Vercel Sandbox seam. Chromium / headless-browser work and any other code that must
// run OUTSIDE a normal serverless function (the crop scrape, Almond's bash tool) goes through here,
// so the "credentials resolution + create + fail-closed + cleanup" plumbing lives in ONE place and
// the two callers (the Almond chat route and the crop scrape step) can never drift.
//
// Secret discipline (mirrors src/lib/ai/gateway.ts): these helpers READ env only. They never log a
// token, and `sandboxCredentials()` returns the values to hand straight to `Sandbox.create` without
// ever stringifying them into a log line. The presence check is separate from the value read so a
// caller can fail closed (503) before any secret is touched.

import { Sandbox } from "@vercel/sandbox";

/**
 * The explicit-token credential triple, or an empty object. When running ON Vercel with an OIDC
 * token present, `Sandbox.create` authenticates implicitly and no explicit triple is needed — so an
 * empty object is the correct, complete set of create-params in that case (mirrors the original
 * Almond route). Never log the returned values.
 */
export type SandboxCredentials =
  | { token: string; teamId: string; projectId: string }
  | Record<string, never>;

/** Resolve the explicit Vercel token triple from env, or `{}` when not all three are set. */
export function sandboxCredentials(): SandboxCredentials {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/**
 * Whether a Sandbox can be created at all: either we are on Vercel with an OIDC token (implicit
 * auth), or the explicit token triple is present. Callers use this to fail closed (503) BEFORE
 * attempting a create. Reads env only; never logs a value.
 */
export function hasSandboxCredentials(): boolean {
  if (process.env.VERCEL && process.env.VERCEL_OIDC_TOKEN) return true;
  return "token" in sandboxCredentials();
}

/** Default sandbox lifetime: 5 minutes (the Almond route's value, kept identical). */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;

export type CreateSandboxOptions = {
  /** Sandbox lifetime in ms. Defaults to DEFAULT_SANDBOX_TIMEOUT_MS. */
  timeoutMs?: number;
};

/**
 * Create a Sandbox using the resolved credentials. When `DOC_EXPORT_SNAPSHOT_ID` is set the sandbox
 * boots from that prebuilt snapshot (the Almond image); otherwise it boots a fresh node24 runtime.
 * This is the EXACT create logic extracted from the Almond chat route, kept behavior-identical so
 * Almond is unchanged. Only call when `hasSandboxCredentials()` is true.
 */
export function createSandbox(options: CreateSandboxOptions = {}): Promise<Sandbox> {
  const snapshotId = process.env.DOC_EXPORT_SNAPSHOT_ID;
  return Sandbox.create({
    ...sandboxCredentials(),
    ...(snapshotId
      ? { source: { type: "snapshot" as const, snapshotId } }
      : { runtime: "node24" as const }),
    timeout: options.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS,
  });
}

/** Stop a sandbox, swallowing (and logging without any secret) any stop error. */
export async function stopSandboxOnce(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.stop();
  } catch (err) {
    console.error("[sandbox] failed to stop sandbox", err);
  }
}

/**
 * Wrap a streaming Response so the sandbox is stopped exactly once when the stream finishes, errors,
 * or is cancelled. A non-streaming response (no body) stops the sandbox immediately. Extracted
 * verbatim from the Almond route so its streaming cleanup is unchanged.
 */
export function withSandboxCleanup(response: Response, sandbox: Sandbox): Response {
  if (!response.body) {
    void stopSandboxOnce(sandbox);
    return response;
  }

  const reader = response.body.getReader();
  let stopped = false;
  const cleanup = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await stopSandboxOnce(sandbox);
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await cleanup();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        await cleanup();
        controller.error(err);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await cleanup();
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Run `fn` against a freshly-created Sandbox and ALWAYS stop it afterward (success or throw). The
 * non-streaming counterpart to `withSandboxCleanup`, for backend steps (the crop scrape) that
 * consume the sandbox fully within one call rather than handing back a stream.
 */
export async function withSandboxCleanupAsync<T>(
  sandbox: Sandbox,
  fn: (sandbox: Sandbox) => Promise<T>,
): Promise<T> {
  try {
    return await fn(sandbox);
  } finally {
    await stopSandboxOnce(sandbox);
  }
}
