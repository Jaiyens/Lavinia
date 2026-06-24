/**
 * Builds the doc-export sandbox snapshot: Python data/pdf/xlsx + Node pptx generation.
 *
 * Libraries:
 *   Python  ù openpyxl, pandas, numpy, reportlab, pypdf
 *   Node    ù pptxgenjs
 *
 * Run once per Vercel project, then set the printed id as env var `DOC_EXPORT_SNAPSHOT_ID`.
 *
 *   Requires:  VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID
 *   Run:       npx tsx scripts/create-doc-export-snapshot.ts
 */

import { Sandbox } from "@vercel/sandbox";

const PYTHON_PACKAGES = ["openpyxl", "pandas", "numpy", "reportlab", "pypdf"];

function credentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

async function run(sandbox: Sandbox, label: string, cmd: string, args: string[], sudo = false): Promise<void> {
  process.stdout.write(`\n$ ${label}\n`);
  const result = await sandbox.runCommand({ cmd, args, sudo });
  const [out, err] = await Promise.all([result.stdout(), result.stderr()]);
  if (out.trim()) process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
  if (err.trim()) process.stderr.write(err.endsWith("\n") ? err : `${err}\n`);
  if (result.exitCode !== 0) {
    throw new Error(`step "${label}" failed with exit code ${result.exitCode}`);
  }
}

async function main(): Promise<void> {
  process.stdout.write("Creating sandboxù\n");
  const sandbox = await Sandbox.create({
    ...credentials(),
    runtime: "python3.13",
    timeout: 300_000,
  });

  try {
    await run(sandbox, "install system deps", "sh", [
      "-c",
      "sudo dnf install -y python3-pip nodejs npm && sudo ldconfig",
    ]);

    await run(sandbox, "install python packages", "python3", [
      "-m", "pip", "install", "--user", ...PYTHON_PACKAGES,
    ]);

    await run(sandbox, "install pptxgenjs", "npm", ["install", "-g", "pptxgenjs"]);

    // Smoke-test Python imports
    await run(sandbox, "smoke-test python", "python3", [
      "-c",
      "import openpyxl, pandas, numpy, reportlab, pypdf; print('python ok')",
    ]);

    // Smoke-test pptxgenjs ó global modules live under /usr/lib/node_modules
    await run(sandbox, "smoke-test pptxgenjs", "sh", [
      "-c",
      "NODE_PATH=$(npm root -g) node -e \"require('pptxgenjs'); console.log('pptxgenjs ok')\"",
    ]);

    process.stdout.write("\nSnapshottingù\n");
    const snap = await sandbox.snapshot();
    process.stdout.write(
      `\n? Snapshot created.\n\n  DOC_EXPORT_SNAPSHOT_ID=${snap.snapshotId}\n\nSet that env var on the Vercel project (and locally) to use this snapshot.\n`,
    );
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}

main().catch((err) => {
  process.stderr.write(`\n? ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
