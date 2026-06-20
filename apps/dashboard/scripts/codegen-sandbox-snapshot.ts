/**
 * One-time builder for the code-gen export sandbox image (the WeasyPrint renderer the Almond codegen
 * skill boots from). Run it ONCE per Vercel project, then set the printed id as the env var
 * `ALMOND_CODEGEN_SNAPSHOT_ID` so `sandbox-run.ts` creates from it — no per-request install.
 *
 *   Local creds (for running this script):  VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID
 *   Run:                                     npx tsx scripts/codegen-sandbox-snapshot.ts
 *
 * It creates a python3.13 sandbox, installs WeasyPrint's system libraries + the package, installs the
 * three Terra fonts (best-effort — WeasyPrint falls back to a default face if a font fails, which does
 * not affect number verification), snapshots, and prints the snapshot id.
 *
 * NOTE: the dnf package names + font URLs below are a sensible starting point for the Amazon-Linux
 * sandbox base; verify them on the first run and adjust if a package/font 404s. Live verification of the
 * whole pipeline is done in a Vercel preview (see the plan), so this is the first thing to run there.
 */

import { Sandbox } from "@vercel/sandbox";

/** WeasyPrint's native dependencies on the dnf-based sandbox base (Pango/Cairo/GDK-Pixbuf stack). */
const SYSTEM_DEPS = [
  "pango",
  "cairo",
  "gdk-pixbuf2",
  "libffi",
  "fontconfig",
  "harfbuzz",
  "freetype",
  "python3-pip",
];

/** The three Terra fonts, fetched from canonical sources into the sandbox user font dir. */
const FONTS: { name: string; url: string }[] = [
  {
    name: "Fraunces.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
  },
  {
    name: "HankenGrotesk.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/hankengrotesk/HankenGrotesk%5Bwght%5D.ttf",
  },
  {
    name: "JetBrainsMono.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
  },
];

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
  process.stdout.write("Creating python3.13 sandbox…\n");
  const sandbox = await Sandbox.create({
    ...credentials(),
    runtime: "python3.13",
    timeout: 300_000,
  });

  try {
    // No --skip-broken: a missing core lib (e.g. pango -> libpango/libgobject) must fail the build
    // LOUDLY here, not silently produce a snapshot that only fails at first real render.
    await run(sandbox, "install system deps", "sh", [
      "-c",
      `sudo dnf install -y ${SYSTEM_DEPS.join(" ")} && sudo ldconfig`,
    ]);

    await run(sandbox, "install weasyprint", "python3", ["-m", "pip", "install", "--user", "weasyprint"]);

    // Fonts are best-effort: download each into the user font dir, then refresh the font cache.
    await run(sandbox, "make font dir", "mkdir", ["-p", "/home/vercel-sandbox/.fonts"]);
    for (const font of FONTS) {
      try {
        await run(sandbox, `fetch ${font.name}`, "curl", [
          "-fsSL",
          "-o",
          `/home/vercel-sandbox/.fonts/${font.name}`,
          font.url,
        ]);
      } catch (err) {
        process.stderr.write(`  (font ${font.name} failed, continuing: ${String(err)})\n`);
      }
    }
    // fc-cache is best-effort and is NOT on the sandbox user's PATH on the AL2023 base, so a missing
    // binary must not abort the snapshot — WeasyPrint resolves ~/.fonts via libfontconfig at render
    // time regardless, and falls back to a default face for any font that did not download.
    try {
      await run(sandbox, "refresh font cache", "fc-cache", ["-f"]);
    } catch (err) {
      process.stderr.write(`  (fc-cache unavailable, continuing: ${String(err)})\n`);
    }

    // Smoke-test WeasyPrint so the snapshot is known-good before we save it.
    await run(sandbox, "smoke-test weasyprint", "python3", [
      "-c",
      "from weasyprint import HTML; HTML(string='<p>ok</p>').write_pdf('/tmp/smoke.pdf'); print('weasyprint ok')",
    ]);

    process.stdout.write("\nSnapshotting…\n");
    const snap = await sandbox.snapshot();
    process.stdout.write(
      `\n✅ Snapshot created.\n\n  ALMOND_CODEGEN_SNAPSHOT_ID=${snap.snapshotId}\n\nSet that env var on the Vercel project (and locally) to enable the codegen renderer.\n`,
    );
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}

main().catch((err) => {
  process.stderr.write(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
