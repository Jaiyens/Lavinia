/**
 * The runtime DISPATCHER for Almond's from-scratch document generation. The codegen skills do not know
 * (or care) whether the model's code runs in a Vercel Sandbox microVM or a local python subprocess —
 * they call `renderXlsx` / `renderPdf` here and get back the same `{ bytes, stdout, stderr, exitCode }`
 * shape. `codegenRuntime()` (flags.ts) picks the runtime: Vercel in prod (strong isolation), local in
 * dev/CI when opted in.
 *
 * The contract the skills rely on:
 *   - A THROW means the RUNTIME is unavailable (no runtime configured, or the sandbox failed to boot) —
 *     an infrastructure failure the skill treats as the silent deterministic fallback.
 *   - A returned non-zero `exitCode` means the model's CODE failed (a python error) — fed back to the
 *     model for a repair attempt within the step budget.
 *   - A returned exit 0 with bytes is a render the verifier then checks fail-closed.
 */

import { codegenRuntime } from "./flags";
import { runRenderXlsxInSandbox } from "./sandbox-run-xlsx";
import { runRenderInSandbox } from "./sandbox-run";
import { runLocalXlsx, runLocalPdf } from "./local-run";
import type { ReportSnapshot } from "./snapshot";

/** Thrown when no code runtime is configured (neither a Vercel Sandbox nor the local opt-in). The skill
 *  catches it (like any sandbox-boot failure) and serves the deterministic fallback. */
export class CodegenRuntimeUnavailableError extends Error {
  constructor() {
    super("No codegen runtime is configured (set Vercel Sandbox creds + snapshot id, or ALMOND_CODEGEN_LOCAL=true)");
    this.name = "CodegenRuntimeUnavailableError";
  }
}

/** Render the model's openpyxl python to .xlsx via the configured runtime. */
export async function renderXlsx(input: {
  snapshot: ReportSnapshot;
  code: string;
  signal?: AbortSignal;
}): Promise<{ xlsxBytes: Buffer | null; stdout: string; stderr: string; exitCode: number }> {
  const runtime = codegenRuntime();
  if (runtime === "vercel") return runRenderXlsxInSandbox(input);
  if (runtime === "local") return runLocalXlsx(input);
  throw new CodegenRuntimeUnavailableError();
}

/** Render the model's HTML/CSS to .pdf via the configured runtime. */
export async function renderPdf(input: {
  snapshot: ReportSnapshot;
  html: string;
  css: string;
  signal?: AbortSignal;
}): Promise<{ pdfBytes: Buffer | null; stdout: string; stderr: string; exitCode: number }> {
  const runtime = codegenRuntime();
  if (runtime === "vercel") return runRenderInSandbox(input);
  if (runtime === "local") return runLocalPdf(input);
  throw new CodegenRuntimeUnavailableError();
}
