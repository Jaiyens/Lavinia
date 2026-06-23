/**
 * DIAGNOSTIC PROBE (not the builder). Boots ONE python3.13 Vercel Sandbox and captures the ground
 * truth the original builder only guessed at: base OS, package manager, per-package dnf install
 * results, whether libpango/libgobject actually land (WeasyPrint loads them via ctypes), pip
 * weasyprint, and a real render smoke-test. Captures every step WITHOUT throwing, so one boot reveals
 * the full picture even when a step fails. Snapshots only if the smoke-test passes.
 *
 * Auth: relies on VERCEL_OIDC_TOKEN in the env (source a `vercel env pull` file first).
 * Run: npx tsx scripts/codegen-sandbox-probe.ts
 */

import { Sandbox } from "@vercel/sandbox";

async function cap(
  sandbox: Sandbox,
  label: string,
  cmd: string,
  args: string[],
  sudo = false,
): Promise<{ exitCode: number; out: string; err: string }> {
  const res = await sandbox.runCommand({ cmd, args, sudo });
  const [out, err] = await Promise.all([res.stdout(), res.stderr()]);
  process.stdout.write(`\n===== ${label}  (exit ${res.exitCode}) =====\n`);
  if (out.trim()) process.stdout.write(out.trimEnd() + "\n");
  if (err.trim()) process.stdout.write("[stderr] " + err.trimEnd() + "\n");
  return { exitCode: res.exitCode, out, err };
}

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

async function main(): Promise<void> {
  process.stdout.write("Creating python3.13 sandbox (OIDC auth)…\n");
  const sandbox = await Sandbox.create({ runtime: "python3.13", timeout: 300_000 });
  process.stdout.write(`Sandbox created: ${sandbox.sandboxId}\n`);

  try {
    await cap(sandbox, "os-release", "cat", ["/etc/os-release"]);
    await cap(sandbox, "whoami", "whoami", []);
    await cap(sandbox, "id", "id", []);
    await cap(sandbox, "python version", "python3", ["--version"]);
    await cap(sandbox, "tooling present?", "sh", [
      "-c",
      "for b in dnf microdnf yum apt-get pip pip3 python3 curl fc-cache sudo ldconfig rpm; do printf '%-10s ' \"$b\"; command -v \"$b\" || echo MISSING; done",
    ]);
    await cap(sandbox, "sudo non-interactive works?", "sh", ["-c", "sudo -n true; echo rc=$?"]);

    // Per-package install so ONE wrong name doesn't hide the status of the others.
    await cap(sandbox, "dnf install each dep (per-package rc)", "sh", [
      "-c",
      `set +e
for p in ${SYSTEM_DEPS.join(" ")}; do
  echo "### dnf install $p"
  sudo dnf install -y "$p" >/tmp/dnf.out 2>&1
  echo "  rc=$?"
  tail -3 /tmp/dnf.out | sed 's/^/  | /'
done
sudo ldconfig
echo "done"`,
    ]);

    await cap(sandbox, "rpm -q each requested name", "sh", [
      "-c",
      SYSTEM_DEPS.map((p) => `printf '%-14s ' "${p}"; rpm -q ${p} 2>/dev/null || echo NOT-INSTALLED`).join("\n"),
    ]);

    // The libraries WeasyPrint dlopen()s — the real success criterion for the system-deps step.
    await cap(sandbox, "WeasyPrint shared libs in ldconfig cache", "sh", [
      "-c",
      "ldconfig -p | grep -iE 'libpango|libcairo|libgobject|libgdk_pixbuf|libfontconfig|libharfbuzz' || echo 'NONE FOUND IN CACHE'",
    ]);
    await cap(sandbox, "find libpango / libgobject on disk", "sh", [
      "-c",
      "find / \\( -name 'libpango-1.0.so*' -o -name 'libpangocairo-1.0.so*' -o -name 'libgobject-2.0.so*' \\) 2>/dev/null | head -20 || echo none",
    ]);

    await cap(sandbox, "pip install weasyprint (--user)", "python3", [
      "-m",
      "pip",
      "install",
      "--user",
      "weasyprint",
    ]);
    await cap(sandbox, "weasyprint import + version", "python3", [
      "-c",
      "import weasyprint; print('weasyprint', weasyprint.__version__)",
    ]);
    const smoke = await cap(sandbox, "weasyprint RENDER smoke", "python3", [
      "-c",
      "from weasyprint import HTML; HTML(string='<h1>Westside Pump 17</h1><p>$61,417.76</p>').write_pdf('/tmp/smoke.pdf'); import os; print('pdf bytes', os.path.getsize('/tmp/smoke.pdf'))",
    ]);

    if (smoke.exitCode === 0) {
      process.stdout.write("\n✅ Smoke PASSED — creating snapshot…\n");
      const snap = await sandbox.snapshot();
      process.stdout.write(`\nSNAPSHOT_ID=${snap.snapshotId}\n`);
    } else {
      process.stdout.write(
        "\n❌ Smoke FAILED — NOT snapshotting. The stderr above is the WeasyPrint ctypes load error (typically a missing libpango/libgobject, i.e. a wrong system-dep package name).\n",
      );
    }
  } finally {
    await sandbox.stop().catch(() => undefined);
    process.stdout.write("\n(sandbox stopped)\n");
  }
}

main().catch((err) => {
  process.stderr.write(`\nFATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
