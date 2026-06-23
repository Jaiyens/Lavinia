# Almond from-scratch document generation (ops)

How Almond builds spreadsheets and reports, and exactly how to turn the live (from-scratch
codegen) path on in production.

This is the DEFAULT path now, not an experiment. When Almond is asked for a spreadsheet or a
report, the model writes the document's code from scratch each turn (real openpyxl Python for
.xlsx, real HTML+CSS for .pdf) and a runtime executes it. There is no fixed template and no
artifact cache: two identical asks do not return the same bytes, and "make the savings column
gold and bold" is just code the model writes, not a capability we had to pre-build.

The deterministic builder still exists, but it is the SILENT last-resort fallback used ONLY when
the runtime is unavailable (offline, CI with no creds, or an outage). With the runtime up, a
model or verification failure is an honest error, never a silent template swap.

## The pieces

- `src/lib/almond/skills/codegen-workbook.ts` - the spreadsheet skill (openpyxl -> .xlsx).
- `src/lib/almond/skills/codegen-export.ts` - the report skill (HTML/CSS -> WeasyPrint -> .pdf).
- `src/lib/almond/codegen/snapshot.ts` (`buildReportSnapshot`) - the farm data the model builds
  over. The same snapshot is written into the runtime as `snapshot.json`, so the model's code
  reads real numbers rather than the model retyping them.
- `src/lib/almond/codegen/run.ts` - the runtime dispatcher (`renderXlsx` / `renderPdf`).
- `src/lib/almond/codegen/sandbox-run-xlsx.ts` - the Vercel Sandbox xlsx runner (runs the
  model's openpyxl script).
- `src/lib/almond/codegen/sandbox-run.ts` - the Vercel Sandbox pdf runner (runs a fixed
  WeasyPrint shim over the model's HTML/CSS).
- `src/lib/almond/codegen/local-run.ts` - the local Python-subprocess runner (dev twin of the
  two sandbox runners).
- `src/lib/almond/codegen/flags.ts` - the env gates and runtime selection.
- `src/lib/almond/codegen/verify.ts` - the fail-closed number guard.
- `scripts/codegen-sandbox-snapshot.ts` - the one-time builder for the Vercel Sandbox image.

The factory `buildAlmondSkills` (`src/lib/almond/tools.ts`) hands the model the codegen skills
ONLY when `isCodegenExportAvailable(hasGatewayKey())` is true (the flag is on, an AI Gateway key
is present, and a runtime is resolvable). When it is not, the deterministic `fileSkills` are
handed instead, so a `canExport` caller always gets a file. Exactly one of the two file sets is
ever handed to the model in a turn, so there is a single, unambiguous file path.

## Runtime selection (`flags.ts` `codegenRuntime()`)

`codegenRuntime()` returns one of `vercel | local | none`:

- `vercel` when Vercel Sandbox creds are resolvable AND `ALMOND_CODEGEN_SNAPSHOT_ID` is set.
  This is the prod path (strong Firecracker isolation). Creds are resolvable when EITHER the
  explicit triple `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` is set, OR
  `VERCEL_OIDC_TOKEN` is present (auto-injected on a Vercel deploy).
- `local` when `ALMOND_CODEGEN_LOCAL=true` (and a Vercel runtime is not configured). This runs
  the model's Python in a `python3 -I` subprocess in an isolated temp dir with a scrubbed env and
  a timeout. It is a dev convenience, not as strong an isolation boundary as the microVM, so prod
  always prefers `vercel`.
- `none` otherwise. The dispatcher then throws `CodegenRuntimeUnavailableError`, which the skill
  catches and treats as the silent deterministic fallback.

`isCodegenExportAvailable(hasGatewayKey)` (the single composite gate the factory uses) is
`isCodegenExportEnabled() && hasGatewayKey && codegenRuntime() !== "none"`.

## Env to set on the `lavinia` Vercel project (prod)

| Env var | What it does | Default / note |
| --- | --- | --- |
| `ALMOND_CODEGEN_EXPORTS` | Master on/off for the from-scratch path. | Default ON. Set to `"false"` to disable and fall back to the deterministic builder. Any other value (or unset) is ON. |
| `ALMOND_CODEGEN_SNAPSHOT_ID` | The pre-built Vercel Sandbox image id (python3.13 + WeasyPrint + openpyxl + pandas + fonts). Required for the `vercel` runtime so there is no per-request install. | From `scripts/codegen-sandbox-snapshot.ts`. Without it (and without the local opt-in) the runtime is `none`. |
| Vercel Sandbox creds | Authenticate `Sandbox.create()`. | On a Vercel deploy `VERCEL_OIDC_TOKEN` is auto-injected, so nothing to set. If you run off-Vercel (or the script), set the explicit triple `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`. |
| AI Gateway key | Lets the model write the code (`hasGatewayKey()`). | Set `AI_GATEWAY_API_KEY` (the project also accepts `VERCEL_AI_SDK_API_KEY`). Already set on the `lavinia` project. |

So a clean production turn-on is: build the snapshot once (below), set
`ALMOND_CODEGEN_SNAPSHOT_ID` on the `lavinia` project, confirm the AI Gateway key is set, and
redeploy. `VERCEL_OIDC_TOKEN` is automatic on deploy, and `ALMOND_CODEGEN_EXPORTS` defaults on,
so those two need no action.

To turn it OFF live without a code change, set `ALMOND_CODEGEN_EXPORTS=false` and redeploy
(Almond falls back to the deterministic export/report builder).

## Building the sandbox snapshot

Run once per Vercel project, then set the printed id as `ALMOND_CODEGEN_SNAPSHOT_ID`.

```sh
# creds: the explicit triple, or a VERCEL_OIDC_TOKEN (e.g. from `vercel env pull`)
export VERCEL_TOKEN=...
export VERCEL_TEAM_ID=...
export VERCEL_PROJECT_ID=...

cd apps/dashboard
npx tsx scripts/codegen-sandbox-snapshot.ts
```

The script boots a python3.13 sandbox, installs WeasyPrint's system libraries plus the package,
installs `openpyxl` + `pandas` (the workbook path; both are pure-Python wheels with no extra
system deps, so one image serves both the .xlsx and the .pdf renderers), installs a clean
sans-serif (Inter) plus the Terra display fonts best-effort, smoke-tests both renderers, takes a
snapshot, and prints:

```
ALMOND_CODEGEN_SNAPSHOT_ID=<id>
```

Set that id on the `lavinia` project (and locally if you want the `vercel` runtime in dev). The
dnf package names and font URLs in the script are a sensible starting point for the
Amazon-Linux sandbox base; verify them on the first run and adjust if anything 404s. Fonts are
best-effort (a missing font does not fail the build and does not affect number verification);
a missing core system lib does fail the build loudly, by design.

## Local dev

To exercise the real from-scratch path without Vercel creds:

```sh
# a python3 on PATH with the libraries the model's code uses
pip install openpyxl weasyprint pandas

export ALMOND_CODEGEN_LOCAL=true
# plus an AI Gateway key in .env.local (AI_GATEWAY_API_KEY or VERCEL_AI_SDK_API_KEY)
npm run dev:dashboard
```

`codegenRuntime()` is then `local`, and the model's Python runs in a `python3 -I` subprocess in
an isolated temp dir (scrubbed env, timeout, temp dir removed after). WeasyPrint also needs its
native libraries (Pango/Cairo/GDK-Pixbuf) on the host for the PDF path; the .xlsx path needs only
openpyxl. If you do not set this up, the runtime is `none` and Almond serves the deterministic
builder, which is exactly the CI behavior.

CI never sets a gateway key, so `isCodegenExportAvailable` is false and the codegen skills are
never registered. The build/typecheck/tests pass without ever spawning a runtime.

## The number guard (`verify.ts`) and the fix-and-retry loop

The model can type a number into a cell or onto the page, so every produced document is checked
fail-closed against the farm snapshot before it is served. The guard runs IN the model loop:

1. The model declares every figure it wrote in a `manifest`: a LITERAL entry tied to a snapshot
   path (e.g. `opportunities[0].savingsCents`), or a DERIVED entry the verifier recomputes
   itself (`op: "sum"` over money paths, or `op: "count"` of an array). The model supplies the
   inputs; the verifier owns the arithmetic, so the model cannot supply a wrong total.
2. After each render, the produced artifact is reopened in our trusted Next.js process (never the
   sandbox): `extractXlsxNumbers` walks every .xlsx cell, `extractPdfText` pulls the PDF text.
3. `verifyWorkbookArtifact` checks BOTH directions: forward (every declared figure resolves and
   equals its snapshot value, derived entries recomputed), and reverse (every number token in the
   rendered document is in the snapshot-derived allowlist). An undeclared or fabricated number,
   an unresolved path, a mismatch, a live spreadsheet formula, or an opaque cell -> reject.
4. A rejection is fed BACK to the model with the offending number named, and the model repairs
   and re-renders within the step budget (6 steps). It is never silently swapped for a template.
5. If the model still cannot produce a verified document with the runtime UP, the skill returns an
   honest error.

The deterministic builder is the fallback ONLY when the runtime is unavailable (the dispatcher
threw `CodegenRuntimeUnavailableError`, or the sandbox failed to boot). A model/verify failure
with the runtime up is NOT a fallback; it is an honest error. This is what keeps "every number is
real and matches the dashboard" true even though the model has full styling freedom.

## Verify it works (live)

With the `vercel` runtime configured (snapshot id + gateway key) on a preview or prod deploy,
ask Almond in the chat:

- A styled spreadsheet, e.g. "Export my farm as an Excel file with the savings column in gold
  and bold and the header row frozen." Expect a real .xlsx whose savings column is gold/bold and
  whose top row is frozen (proving the model authored openpyxl, not a fixed template).
- A scoped report, e.g. "Make a PDF report for just the Westside ranch meters." Expect a PDF
  scoped to that slice, not the whole farm.
- A recolor on a repeat ask, e.g. follow up with "Same report but in a dark theme." Expect a
  visibly different document, confirming there is no cache.
- No two identical asks return cached bytes. Ask the exact same thing twice; the downloads are
  independently generated (the artifact caches were removed), so they are not byte-identical.
- The number guard repairs a planted bad number. The guard is exercised end-to-end by
  `verify.test.ts` (the pure core) and on the live path by the in-loop reject-and-repair: if the
  model writes a figure not in the snapshot, the render is rejected with that number named and the
  model fixes it before the document is served. A document that reaches the grower has passed the
  guard.

If codegen is unavailable (no snapshot id, no creds, no gateway key, or
`ALMOND_CODEGEN_EXPORTS=false`), Almond still returns a real document from the deterministic
builder. That is correct, but it means the from-scratch path is not the one running. Check
`codegenRuntime()` is `vercel` (or `local` in dev) and `hasGatewayKey()` is true.
