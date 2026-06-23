/**
 * The Vercel Sandbox runtime for the WORKBOOK from-scratch path — the xlsx twin of sandbox-run.ts. The
 * model writes a complete openpyxl PYTHON script (reads snapshot.json, builds the workbook with full
 * styling freedom — any color, font, border, merge, conditional format, chart — and writes out.xlsx);
 * this executes it inside an ephemeral Firecracker microVM, so the model-authored code never runs in the
 * Next.js process. The numbers are guarded AFTER the fact: the produced .xlsx is reopened in our trusted
 * process and every cell value is scanned against the snapshot allowlist (verify.ts), so full styling
 * freedom never widens the number-honesty surface.
 *
 * It boots from the pre-built snapshot (python3.13 + WeasyPrint + openpyxl + the Terra fonts — see
 * scripts/codegen-sandbox-snapshot.ts), so there is no per-request install. Auth, timeout, signal
 * threading, and the always-stop-in-finally discipline mirror sandbox-run.ts. The dispatcher (run.ts)
 * only calls this when the Vercel runtime is configured (flags.ts); throwing here means the runtime is
 * unavailable, which the skill treats as the silent deterministic fallback.
 */

import { Sandbox } from "@vercel/sandbox";
import { codegenSnapshotId } from "./flags";
import type { ReportSnapshot } from "./snapshot";

/** The sandbox working directory `writeFiles` defaults to; `gen.py` + its inputs live here. */
const SANDBOX_DIR = "/vercel/sandbox";

/** How long the microVM may live before auto-terminating (boot + a single render is seconds). */
const SANDBOX_TIMEOUT_MS = 120_000;

/** Vercel Sandbox credentials from the explicit local triple, else `{}` so the SDK falls back to the
 *  auto-injected OIDC token on a Vercel deploy. Mirrors sandbox-run.ts. */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/** The inputs for one workbook render attempt. `code` is the model's COMPLETE openpyxl python script
 *  (serialized to the sandbox as gen.py); it runs against `snapshot.json` written alongside. */
export type RenderXlsxInput = {
  snapshot: ReportSnapshot;
  code: string;
  signal?: AbortSignal;
};

/** The result of one render attempt. `xlsxBytes` is null when the render produced no file (an error);
 *  `stderr`/`exitCode` let the caller feed a failure back to the model. */
export type RenderXlsxOutput = {
  xlsxBytes: Buffer | null;
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Render the model's openpyxl script to .xlsx in a fresh sandbox. Boots from the pre-built snapshot,
 * writes `snapshot.json` + `gen.py` (the model's code), runs `python3 -I gen.py`, and reads `out.xlsx`
 * back as a Buffer. The sandbox is ALWAYS stopped in `finally`. Throws only if the snapshot id is missing
 * (a misconfiguration); every other failure is reported via `exitCode`/`stderr` so the caller can feed
 * it back to the model for a repair attempt.
 */
export async function runRenderXlsxInSandbox(input: RenderXlsxInput): Promise<RenderXlsxOutput> {
  const snapshotId = codegenSnapshotId();
  if (snapshotId === null) {
    throw new Error("ALMOND_CODEGEN_SNAPSHOT_ID is not set; cannot create the openpyxl sandbox");
  }

  const sandbox = await Sandbox.create({
    ...sandboxCredentials(),
    source: { type: "snapshot", snapshotId },
    timeout: SANDBOX_TIMEOUT_MS,
    signal: input.signal,
  });

  try {
    await sandbox.writeFiles([
      { path: "snapshot.json", content: JSON.stringify(input.snapshot) },
      { path: "gen.py", content: input.code },
    ]);

    const result = await sandbox.runCommand({
      cmd: "python3",
      args: ["-I", "gen.py"],
      cwd: SANDBOX_DIR,
      signal: input.signal,
    });

    const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
    const xlsxBytes =
      result.exitCode === 0
        ? await sandbox.readFileToBuffer({ path: "out.xlsx", cwd: SANDBOX_DIR }, { signal: input.signal })
        : null;

    return { xlsxBytes, stdout, stderr, exitCode: result.exitCode };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
