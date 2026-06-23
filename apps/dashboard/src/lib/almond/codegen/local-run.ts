/**
 * The LOCAL code runtime for Almond's from-scratch document generation: it runs the model-authored
 * Python in a `python3` subprocess on the host, used in dev/CI when a Vercel Sandbox is not configured
 * (opt-in via `ALMOND_CODEGEN_LOCAL=true` — see flags.ts). It mirrors the Vercel runners' contract
 * (sandbox-run-xlsx.ts / sandbox-run.ts) so the dispatcher (run.ts) can treat the two interchangeably.
 *
 * TRUST BOUNDARY: the python here is authored by OUR OWN model from a tightly-scoped prompt whose only
 * job is "read snapshot.json -> write out.xlsx/out.pdf". It still runs on the host (NOT a microVM), so it
 * is treated as semi-trusted and isolated as far as a subprocess allows: a per-run TEMP dir as the only
 * cwd, `python3 -I` (isolated mode: no PYTHONPATH/PYTHON* env, no user-site, cwd off sys.path), a minimal
 * scrubbed environment (no secrets/tokens reach the child), a hard timeout, and the temp dir removed in
 * `finally`. Prod always prefers the Vercel runtime (the strong Firecracker boundary); the local runtime
 * is a developer convenience so the real from-scratch path is exercisable without Vercel creds.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReportSnapshot } from "./snapshot";

/** How long a single local render may run before it is killed (boot + one render is seconds). */
const LOCAL_TIMEOUT_MS = 120_000;

/** A file to drop into the per-run temp dir before executing the script. */
type RunFile = { name: string; content: string };

/** The raw result of one local python execution. `outBytes` is null when the expected output file was
 *  not produced (a non-zero exit, a missing file, or a read error). */
type LocalRunResult = {
  outBytes: Buffer | null;
  stdout: string;
  stderr: string;
  exitCode: number;
};

/** A minimal, scrubbed environment for the child: PATH so `python3` resolves, plus the few locale/home
 *  vars python and its libraries read. Deliberately omits every secret/token in `process.env`. */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT"]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/**
 * Run one python script in an isolated temp dir and read back `outName`. Writes every input file, spawns
 * `python3 -I <script>` with a scrubbed env + timeout (and the caller's abort signal), captures
 * stdout/stderr, and reads the output file when the process exits 0. The temp dir is ALWAYS removed in
 * `finally`. Never throws for a render failure (it is reported via exitCode/stderr); throws only if the
 * temp dir cannot be created (an environment problem the dispatcher treats as runtime-unavailable).
 */
async function runPython(
  files: RunFile[],
  scriptName: string,
  outName: string,
  signal?: AbortSignal,
): Promise<LocalRunResult> {
  const dir = await mkdtemp(join(tmpdir(), "almond-codegen-"));
  try {
    await Promise.all(files.map((f) => writeFile(join(dir, f.name), f.content, "utf8")));

    const { stdout, stderr, exitCode } = await new Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>((resolve) => {
      // The project augments `ProcessEnv` to require some app keys; the scrubbed child env intentionally
      // has none of them, so cast to the spawn option's env type (the runtime shape is a plain string map).
      // No `python3 -I`: dev installs openpyxl/weasyprint into the USER site (pip install --user), which
      // isolated mode hides -> ModuleNotFoundError. The isolation here is the scrubbed env (no secrets, no
      // PYTHONPATH) + the temp-dir cwd; the strong boundary is the Vercel microVM, not a python flag.
      const child = spawn("python3", [scriptName], {
        cwd: dir,
        env: childEnv() as unknown as NodeJS.ProcessEnv,
        timeout: LOCAL_TIMEOUT_MS,
        killSignal: "SIGKILL",
        signal,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        err += d.toString();
      });
      // A spawn error (python3 not on PATH, killed by timeout/abort) resolves to a non-zero exit with the
      // message on stderr, so the caller treats it like any other render failure (never an unhandled throw).
      child.on("error", (e: Error) => resolve({ stdout: out, stderr: err || e.message, exitCode: 1 }));
      child.on("close", (code: number | null) => resolve({ stdout: out, stderr: err, exitCode: code ?? 1 }));
    });

    let outBytes: Buffer | null = null;
    if (exitCode === 0) {
      try {
        outBytes = await readFile(join(dir, outName));
      } catch {
        outBytes = null;
      }
    }
    return { outBytes, stdout, stderr, exitCode };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The fixed WeasyPrint shim (NOT model-authored) for the local PDF path — byte-parity with the Vercel
 *  runner's RENDER_PY. Renders the model's report.html + styles.css to out.pdf. */
const LOCAL_RENDER_PY = `import sys
from weasyprint import HTML, CSS

try:
    HTML("report.html").write_pdf("out.pdf", stylesheets=[CSS("styles.css")])
except Exception as exc:  # noqa: BLE001
    print(str(exc), file=sys.stderr)
    sys.exit(1)
`;

/** Render the model's openpyxl PYTHON to .xlsx locally. The model's `code` is the complete script
 *  (reads snapshot.json, writes out.xlsx); snapshot.json is provided alongside as the data handoff. */
export async function runLocalXlsx(input: {
  snapshot: ReportSnapshot;
  code: string;
  signal?: AbortSignal;
}): Promise<{ xlsxBytes: Buffer | null; stdout: string; stderr: string; exitCode: number }> {
  const r = await runPython(
    [
      { name: "snapshot.json", content: JSON.stringify(input.snapshot) },
      { name: "gen.py", content: input.code },
    ],
    "gen.py",
    "out.xlsx",
    input.signal,
  );
  return { xlsxBytes: r.outBytes, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}

/** Render the model's HTML/CSS to .pdf locally with the fixed WeasyPrint shim. */
export async function runLocalPdf(input: {
  snapshot: ReportSnapshot;
  html: string;
  css: string;
  signal?: AbortSignal;
}): Promise<{ pdfBytes: Buffer | null; stdout: string; stderr: string; exitCode: number }> {
  const r = await runPython(
    [
      { name: "snapshot.json", content: JSON.stringify(input.snapshot) },
      { name: "render.py", content: LOCAL_RENDER_PY },
      { name: "report.html", content: input.html },
      { name: "styles.css", content: input.css },
    ],
    "render.py",
    "out.pdf",
    input.signal,
  );
  return { pdfBytes: r.outBytes, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}
