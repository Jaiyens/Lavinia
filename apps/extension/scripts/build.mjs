// Build the MV3 extension into dist/.
//
// Bundles the three TS entry points (service worker, popup, options) with
// esbuild, then copies the static assets (manifest.json, *.html, icons/).
//
// This is a STANDALONE workspace build. It is intentionally decoupled from the
// dashboard's Next.js build: it produces a plain dist/ folder of an unpacked
// extension and depends on nothing under apps/dashboard.
//
// Resilience: this workspace's devDeps (esbuild) are deliberately NOT installed
// in this worktree / in CI (the probe is not CI-gated and never runs in prod).
// If esbuild is unavailable we exit 0 with a clear notice rather than failing a
// monorepo-wide `turbo run build`. Install the workspace deps to produce a real
// bundle.

import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");

const ENTRIES = [
  { in: "src/service-worker.ts", out: "service-worker.js" },
  { in: "src/popup/popup.ts", out: "popup/popup.js" },
  { in: "src/options/options.ts", out: "options/options.js" },
];

const STATIC = [
  { from: "manifest.json", to: "manifest.json" },
  { from: "src/popup/popup.html", to: "popup/popup.html" },
  { from: "src/options/options.html", to: "options/options.html" },
];

async function main() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    console.log(
      "[extension] esbuild not installed; skipping bundle. " +
        "This probe workspace is not CI-gated. Run `npm install` in apps/extension to build a real dist/.",
    );
    return; // exit 0 — do not break a monorepo-wide build
  }

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  await esbuild.build({
    entryPoints: ENTRIES.map((e) => resolve(root, e.in)),
    outdir: dist,
    outbase: resolve(root, "src"),
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    minify: false,
    sourcemap: false,
  });

  for (const asset of STATIC) {
    const from = resolve(root, asset.from);
    const to = resolve(dist, asset.to);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }

  const icons = resolve(root, "icons");
  if (existsSync(icons)) {
    cpSync(icons, resolve(dist, "icons"), { recursive: true });
  }

  console.log("[extension] built dist/ (unpacked MV3 extension).");
}

main().catch((err) => {
  console.error("[extension] build failed:", err?.message ?? err);
  process.exit(1);
});
