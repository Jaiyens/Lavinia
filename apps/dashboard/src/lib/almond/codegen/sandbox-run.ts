/**
 * The Vercel Sandbox renderer for the code-gen export POC — the ONLY module that imports
 * `@vercel/sandbox`. The model writes the report's HTML/CSS; this renders it to PDF inside an ephemeral
 * Firecracker microVM, so the untrusted markup never touches the Next.js process.
 *
 * The sandbox is created FROM A PRE-BUILT SNAPSHOT (python3.13 + WeasyPrint + the Terra fonts already
 * installed — see scripts/codegen-sandbox-snapshot.ts), so there is NO per-request install: boot, write
 * four files, run a fixed `render.py` shim, read `out.pdf` back. `render.py` is authored by US (never
 * the model); the model contributes only declarative `report.html` + `styles.css`, shrinking the
 * untrusted surface to markup.
 *
 * Auth: on a Vercel deploy the OIDC token is auto-injected; locally the explicit token/team/project
 * triple is spread into `Sandbox.create`. The skill only ever calls this when those creds + a snapshot
 * id are present (capability-by-omission, see flags.ts), so this is never reached in dev/CI.
 */

import { Sandbox } from "@vercel/sandbox";
import { codegenSnapshotId } from "./flags";
import type { ReportSnapshot } from "./snapshot";

/** The sandbox working directory `writeFiles` defaults to; `render.py` and its inputs live here. */
const SANDBOX_DIR = "/vercel/sandbox";

/** How long the microVM may live before auto-terminating (boot + a single render is seconds). */
const SANDBOX_TIMEOUT_MS = 120_000;

/**
 * The fixed render shim (NOT model-authored). Renders the model's `report.html` + `styles.css` to
 * `out.pdf` with WeasyPrint. On any WeasyPrint error it prints the message to stderr and exits non-zero,
 * so the caller can feed the error back to the model for a retry. `snapshot.json` is written alongside
 * (the hermetic data handoff) but the POC's report inlines its numbers in the HTML, so the shim does not
 * read it.
 */
const RENDER_PY = `import sys
from weasyprint import HTML, CSS

try:
    HTML("report.html").write_pdf("out.pdf", stylesheets=[CSS("styles.css")])
except Exception as exc:  # noqa: BLE001 — surface any render error to stderr for the retry loop
    print(str(exc), file=sys.stderr)
    sys.exit(1)
`;

/** Vercel Sandbox credentials from the explicit local triple, else `{}` so the SDK falls back to the
 *  auto-injected OIDC token on a Vercel deploy. */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/** The inputs the model contributes for one render attempt. */
export type RenderInput = {
  snapshot: ReportSnapshot;
  /** The model's self-contained report markup. */
  html: string;
  /** The model's stylesheet (Terra design tokens). */
  css: string;
  signal?: AbortSignal;
};

/** The result of one render attempt. `pdfBytes` is null when the render produced no file (an error);
 *  `stderr`/`exitCode` let the caller feed a failure back to the model. */
export type RenderOutput = {
  pdfBytes: Buffer | null;
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Render one HTML/CSS document to PDF in a fresh sandbox. Boots from the pre-built WeasyPrint snapshot,
 * writes the four files, runs `python3 render.py`, and reads `out.pdf` back as a Buffer. The sandbox is
 * ALWAYS stopped in `finally` (a leaked microVM bills until its timeout). Throws only if the snapshot id
 * is missing (a misconfiguration the skill guards against) — every other failure is reported via the
 * returned `exitCode`/`stderr` so the caller can fall back deterministically.
 */
export async function runRenderInSandbox(input: RenderInput): Promise<RenderOutput> {
  const snapshotId = codegenSnapshotId();
  if (snapshotId === null) {
    throw new Error("ALMOND_CODEGEN_SNAPSHOT_ID is not set; cannot create the WeasyPrint sandbox");
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
      { path: "render.py", content: RENDER_PY },
      { path: "report.html", content: input.html },
      { path: "styles.css", content: input.css },
    ]);

    const result = await sandbox.runCommand({
      cmd: "python3",
      args: ["render.py"],
      cwd: SANDBOX_DIR,
      signal: input.signal,
    });

    const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
    const pdfBytes =
      result.exitCode === 0
        ? await sandbox.readFileToBuffer({ path: "out.pdf", cwd: SANDBOX_DIR }, { signal: input.signal })
        : null;

    return { pdfBytes, stdout, stderr, exitCode: result.exitCode };
  } finally {
    // Never leave a microVM running — it bills until the timeout even on an error/abort.
    await sandbox.stop().catch(() => undefined);
  }
}
