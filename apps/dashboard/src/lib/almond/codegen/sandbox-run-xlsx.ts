/**
 * The Vercel Sandbox renderer for the WORKBOOK code-gen path (Phase 3) — the xlsx twin of
 * sandbox-run.ts. The model writes a DECLARATIVE workbook spec (workbook.json: sheets, typed cells,
 * styles, optional native charts — DATA, never code); this renders it to `out.xlsx` with openpyxl
 * inside an ephemeral Firecracker microVM, so nothing the model produced executes in the Next.js
 * process. `render_xlsx.py` is authored by US (never the model) and only WALKS the JSON tree.
 *
 * It boots from the SAME pre-built snapshot as the PDF path (python3.13 + WeasyPrint + openpyxl + the
 * Terra fonts — see scripts/codegen-sandbox-snapshot.ts), so there is no per-request install. Auth,
 * timeout, signal threading, and the always-stop-in-finally discipline mirror sandbox-run.ts exactly.
 * The skill only ever calls this when the creds + a snapshot id are present (capability-by-omission,
 * flags.ts), so it is never reached in dev/CI.
 */

import { Sandbox } from "@vercel/sandbox";
import { codegenSnapshotId } from "./flags";
import type { ReportSnapshot } from "./snapshot";

/** The sandbox working directory `writeFiles` defaults to; `render_xlsx.py` + its inputs live here. */
const SANDBOX_DIR = "/vercel/sandbox";

/** How long the microVM may live before auto-terminating (boot + a single render is seconds). */
const SANDBOX_TIMEOUT_MS = 120_000;

/**
 * The fixed openpyxl render shim (NOT model-authored). Reads `workbook.json` (declarative, data only)
 * and writes `out.xlsx`, reproducing the Phase 1 styled workbook byte-for-byte (brand-green header
 * band, frozen header, autofilter, currency/integer number formats, zebra, optional totals) PLUS
 * native charts (the one thing the in-process ExcelJS builder cannot do). It is defensive: every field
 * is `.get`-defaulted and type-checked; a currency/integer cell whose value is not a real number is
 * written as TEXT (never coerced), null is an empty cell (never 0), and a bad chart spec is skipped
 * (never fatal). Any unexpected error prints to stderr + exits non-zero so the caller can feed it back
 * to the model for a retry — the same contract as RENDER_PY.
 */
const RENDER_XLSX_PY = `import sys, json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, Reference

# Terra palette as ARGB ("FFRRGGBB") - byte-identical to ExcelJS in export/workbook.ts.
BRAND_GREEN      = "FF2FA84F"
BRAND_GREEN_DARK = "FF1F7A39"
HEADER_TEXT      = "FFFFFFFF"
TITLE_TEXT       = "FF16181D"
MUTED_TEXT       = "FF6B7280"
ZEBRA_FILL       = "FFF2F4F7"
TOTALS_RULE      = "FFCBD2D9"

CURRENCY_FMT = '"$"#,##0.00'
INTEGER_FMT  = "#,##0"
FORBIDDEN    = set('\\\\/*?:[]')

def safe_sheet_name(name):
    s = "".join(c for c in str(name if name is not None else "") if c not in FORBIDDEN)
    s = " ".join(s.split())[:31]
    return s if s else "Sheet"

def num_fmt_for(fmt):
    if fmt == "currency": return CURRENCY_FMT
    if fmt == "integer":  return INTEGER_FMT
    return None

def is_numeric(fmt):
    return fmt in ("currency", "integer")

def cell_text(cell):
    v = cell.get("value")
    if v is None: return ""
    if cell.get("format") == "currency" and isinstance(v, (int, float)) and not isinstance(v, bool):
        cents = round(v * 100)
        sign = "-" if cents < 0 else ""
        a = abs(cents)
        return "%s$%s.%02d" % (sign, format(a // 100, ",d"), a % 100)
    return str(v)

def auto_width(column, col_index, rows):
    w = column.get("width")
    if isinstance(w, (int, float)) and not isinstance(w, bool): return w
    longest = len(str(column.get("header", "")))
    for row in rows:
        if isinstance(row, list) and col_index < len(row):
            cell = row[col_index]
            longest = max(longest, len(cell_text(cell if isinstance(cell, dict) else {"value": cell})))
    return min(max(longest + 2, 12), 48)

def write_cell(ws, r, c, cell, bold=False, top_rule=False, fill=None):
    target = ws.cell(row=r, column=c)
    raw = cell.get("value", None)
    fmt = cell.get("format")
    numeric = is_numeric(fmt) and isinstance(raw, (int, float)) and not isinstance(raw, bool)
    if raw is None:
        target.value = None
    elif numeric:
        target.value = raw
        target.number_format = num_fmt_for(fmt)
        target.alignment = Alignment(horizontal="right")
    else:
        target.value = str(raw)
    color = MUTED_TEXT if fmt == "label" else TITLE_TEXT
    target.font = Font(color=color, bold=bool(bold))
    if fill:
        target.fill = PatternFill(fill_type="solid", fgColor=fill)
    if top_rule:
        target.border = Border(top=Side(style="thin", color=TOTALS_RULE))
    return target

def render_sheet(wb, spec, first):
    ws = wb.active if first else wb.create_sheet()
    ws.title = safe_sheet_name(spec.get("name"))
    columns = spec.get("columns") or []
    rows    = spec.get("rows") or []
    freeze  = spec.get("freezeHeader") is not False
    afilter = spec.get("autoFilter") is not False
    zebra   = spec.get("zebra") is not False

    t = ws.cell(row=1, column=1, value=str(spec.get("title", "")))
    t.font = Font(bold=True, size=13, color=TITLE_TEXT)
    header_row = 3

    for i, col in enumerate(columns):
        hc = ws.cell(row=header_row, column=i + 1, value=str(col.get("header", "")))
        hc.font = Font(bold=True, color=HEADER_TEXT)
        hc.fill = PatternFill(fill_type="solid", fgColor=BRAND_GREEN)
        hc.alignment = Alignment(vertical="center")
        hc.border = Border(bottom=Side(style="thin", color=BRAND_GREEN_DARK))

    r = header_row
    for i, row in enumerate(rows):
        if not isinstance(row, list): continue
        r += 1
        fill = ZEBRA_FILL if (zebra and i % 2 == 1) else None
        for c, cell in enumerate(row):
            write_cell(ws, r, c + 1, cell if isinstance(cell, dict) else {"value": cell}, fill=fill)

    totals = spec.get("totals")
    if isinstance(totals, list):
        r += 1
        for c, cell in enumerate(totals):
            write_cell(ws, r, c + 1, cell if isinstance(cell, dict) else {"value": cell}, bold=True, top_rule=True)

    r += 2
    for line in (spec.get("footer") or []):
        fc = ws.cell(row=r, column=1, value=str(line))
        fc.font = Font(italic=True, color=MUTED_TEXT)
        r += 1

    if freeze and columns:
        ws.freeze_panes = "A%d" % (header_row + 1)
    if afilter and columns:
        ws.auto_filter.ref = "%s%d:%s%d" % (get_column_letter(1), header_row, get_column_letter(len(columns)), header_row)
    for i, col in enumerate(columns):
        ws.column_dimensions[get_column_letter(i + 1)].width = auto_width(col, i, rows)

    for chart_spec in (spec.get("charts") or []):
        try:
            kind = chart_spec.get("type")
            chart = LineChart() if kind == "line" else BarChart()
            chart.title = str(chart_spec.get("title", ""))
            data = Reference(ws,
                min_col=int(chart_spec["dataMinCol"]), max_col=int(chart_spec["dataMaxCol"]),
                min_row=int(chart_spec["dataMinRow"]), max_row=int(chart_spec["dataMaxRow"]))
            cats = Reference(ws,
                min_col=int(chart_spec["catMinCol"]), max_col=int(chart_spec["catMaxCol"]),
                min_row=int(chart_spec["catMinRow"]), max_row=int(chart_spec["catMaxRow"]))
            chart.add_data(data, titles_from_data=True)
            chart.set_categories(cats)
            anchor = str(chart_spec.get("anchor", "H2"))
            ws.add_chart(chart, anchor)
        except Exception:
            continue

def main():
    with open("workbook.json", "r", encoding="utf-8") as f:
        spec = json.load(f)
    sheets = spec.get("sheets")
    if not isinstance(sheets, list) or len(sheets) == 0:
        print("workbook.json has no sheets", file=sys.stderr); sys.exit(1)
    wb = Workbook()
    for i, sheet in enumerate(sheets):
        if not isinstance(sheet, dict):
            print("sheet %d is not an object" % i, file=sys.stderr); sys.exit(1)
        render_sheet(wb, sheet, first=(i == 0))
    wb.save("out.xlsx")

try:
    main()
except Exception as exc:  # noqa: BLE001 - surface any render error to stderr for the retry loop
    print(str(exc), file=sys.stderr)
    sys.exit(1)
`;

/** Vercel Sandbox credentials from the explicit local triple, else `{}` so the SDK falls back to the
 *  auto-injected OIDC token on a Vercel deploy. Mirrors sandbox-run.ts. */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/** The inputs for one workbook render attempt. `workbookJson` is the model's DECLARATIVE spec
 *  (serialized to the sandbox as workbook.json); it is `unknown` because the shim re-validates it. */
export type RenderXlsxInput = {
  snapshot: ReportSnapshot;
  workbookJson: unknown;
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
 * Render one declarative workbook spec to .xlsx in a fresh sandbox. Boots from the pre-built snapshot
 * (WeasyPrint + openpyxl), writes the inputs, runs `python3 render_xlsx.py`, and reads `out.xlsx` back
 * as a Buffer. The sandbox is ALWAYS stopped in `finally`. Throws only if the snapshot id is missing (a
 * misconfiguration the skill guards against); every other failure is reported via `exitCode`/`stderr`
 * so the caller can fall back deterministically.
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
      // snapshot.json is the hermetic data handoff (parity with the PDF path); the shim renders from
      // workbook.json, but it is written for symmetry + future shims that read the snapshot directly.
      { path: "snapshot.json", content: JSON.stringify(input.snapshot) },
      { path: "render_xlsx.py", content: RENDER_XLSX_PY },
      { path: "workbook.json", content: JSON.stringify(input.workbookJson) },
    ]);

    const result = await sandbox.runCommand({
      cmd: "python3",
      args: ["render_xlsx.py"],
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
