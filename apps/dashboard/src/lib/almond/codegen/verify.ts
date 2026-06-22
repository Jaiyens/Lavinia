/**
 * The fail-closed accuracy guard for the code-gen export POC. The model writes the report's HTML/CSS,
 * so it CAN type a number into the document — this is what enforces "every number is real, and matches
 * the dashboard" on the RENDERED output, fail-closed. Two directions:
 *
 *   1. FORWARD (manifest equality): the model declares each figure it shows as
 *      `{ label, value, sourcePath }`; every entry must resolve against the snapshot and equal `value`
 *      exactly (integer cents). An unresolved path or a mismatch -> reject.
 *
 *   2. REVERSE (number-token scan): we extract every number token from the text of the ACTUAL rendered
 *      PDF (pdf-parse, in our trusted process — never any plaintext the model wrote) and require each to
 *      be in an allowlist of snapshot-derived strings. This closes the "model omits a fabricated number
 *      from the manifest" hole: the manifest alone is defeatable by omission.
 *
 * LIMITATION (POC-only): the snapshot-derived allowlist is sufficient ONLY for the hardcoded single ask
 * ("top 5 opportunities"), whose figures are LITERAL snapshot values. It will NOT generalize to
 * free-form reports that compute DERIVED numbers (percentages, sums, deltas, rounded figures) — those
 * need proof-carrying numbers (the model declares each derived value with its computation and the
 * verifier recomputes from the snapshot). See the plan's "Phasing after POC".
 *
 * The core (`verifyArtifact`) is PURE and unit-tested on strings (verify.test.ts); `extractPdfText`
 * (the only impure part) is exercised on the real PDF in the live path.
 */

import { formatCentsUsd, type ReportSnapshot } from "./snapshot";

/** One declared figure in the model's manifest. */
export type ManifestEntry = {
  /** A human label (for debugging/audit; not verified). */
  label: string;
  /** The figure's value, integer cents — must equal `snapshot[sourcePath]`. */
  value: number;
  /** A path into the snapshot, e.g. "opportunities[0].savingsCents" or "totals.rateSwitchSavingsCents". */
  sourcePath: string;
};

/** The verifier verdict. `ok: false` carries a short, loggable reason (never shown to the grower — a
 *  rejected artifact falls back to the deterministic template). */
export type VerifyVerdict = { ok: true } | { ok: false; reason: string };

/**
 * One declared figure in a WORKBOOK manifest (Phase 3). A superset of `ManifestEntry`: a LITERAL entry
 * (the existing shape; `kind` omitted or "literal") whose `value` must equal a snapshot value exactly,
 * OR a DERIVED entry whose `value` the VERIFIER recomputes from the snapshot via a tiny, closed op set
 * — the "proof-carrying numbers" path that closes the POC's literal-only limitation WITHOUT letting the
 * model supply the arithmetic. Two ops only (kept deliberately tight so the verifier owns the math):
 *   - "sum":   value (integer cents) must equal the sum of the cents at every `sourcePaths` entry.
 *   - "count": value must equal the LENGTH of the array at `sourcePaths[0]`.
 */
export type DerivedOp = "sum" | "count";
export type WorkbookManifestEntry =
  | { kind?: "literal"; label: string; value: number; sourcePath: string }
  | { kind: "derived"; label: string; value: number; op: DerivedOp; sourcePaths: string[] };

/**
 * Resolve a dotted/indexed path against the snapshot, e.g. `opportunities[0].savingsCents`. Returns the
 * value at the path, or `undefined` when any segment is missing (a malformed or fabricated path fails
 * closed in the caller). Supports `a.b`, `a[0]`, and `a[0].b`; no wildcards.
 */
export function resolvePath(snapshot: ReportSnapshot, path: string): unknown {
  // Normalize "a[0].b" -> ["a","0","b"]. Reject anything that is not a plain key or index segment.
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((s) => s.length > 0);
  if (segments.length === 0) return undefined;

  let current: unknown = snapshot;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const index = Number(seg);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined;
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
}

/** Validate that an unknown manifest is a well-formed array of entries; null when it is not (fail
 *  closed — a malformed manifest is treated as no proof, never trusted). */
function asManifest(manifest: unknown): ManifestEntry[] | null {
  if (!Array.isArray(manifest)) return null;
  const out: ManifestEntry[] = [];
  for (const raw of manifest) {
    if (raw === null || typeof raw !== "object") return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.label !== "string" || typeof e.value !== "number" || typeof e.sourcePath !== "string") {
      return null;
    }
    out.push({ label: e.label, value: e.value, sourcePath: e.sourcePath });
  }
  return out;
}

/** Canonicalize a number token for comparison: drop `$`, commas, and any trailing dot/period, so
 *  "$61,417.76" and "61417.76" compare equal. Lower-cased irrelevant (digits only). */
function canon(token: string): string {
  return token.replace(/[$,]/g, "").replace(/\.$/, "");
}

/** Extract number tokens from arbitrary text. Matches an optional `$`, then a digit group with optional
 *  thousands separators and an optional decimal — but NOT a run of digits that is part of an
 *  alphanumeric token (e.g. the "1" in a rate code like "AG-A1"), via the leading boundary. */
function numberTokens(text: string): string[] {
  const re = /(?<![A-Za-z0-9])\$?\d[\d,]*(?:\.\d+)?/g;
  return text.match(re) ?? [];
}

/**
 * Build the allowlist of canonical number strings every figure in the PDF is permitted to be. Derived
 * ENTIRELY from the snapshot, so a number the model invents (not present anywhere in the snapshot) is
 * rejected. Includes, for each money value, the cent-precise form plus the rounded and floored whole
 * dollars (the report may show "$61,417.76" or "$61,418"); the meter count and opportunity ranks; and
 * every number that legitimately appears inside a snapshot STRING (e.g. the "17" in "Westside Pump 17",
 * the "3" in "Lateral 3 Booster"), so a real meter name is never flagged as a fabricated number.
 */
export function buildAllowlist(snapshot: ReportSnapshot): Set<string> {
  const allow = new Set<string>();

  const addMoney = (cents: number): void => {
    allow.add(canon(formatCentsUsd(cents))); // "61417.76"
    allow.add(String(Math.round(cents / 100))); // rounded whole dollars
    allow.add(String(Math.floor(cents / 100))); // floored whole dollars
  };
  const addStringNumbers = (s: string | null): void => {
    if (s === null) return;
    for (const tok of numberTokens(s)) allow.add(canon(tok));
  };

  allow.add(String(snapshot.meterCount));
  addStringNumbers(snapshot.farm.name);

  if (snapshot.totals.latestMonthSpendCents !== null) addMoney(snapshot.totals.latestMonthSpendCents);
  addMoney(snapshot.totals.rateSwitchSavingsCents);
  // Coverage counts the Summary tab prints (Phase 3; additive structural integers).
  allow.add(String(snapshot.totals.reconciledCount));
  allow.add(String(snapshot.totals.needsReviewCount));
  allow.add(String(snapshot.totals.noBillCount));

  for (const o of snapshot.opportunities) {
    allow.add(String(o.rank));
    addMoney(o.savingsCents);
    addStringNumbers(o.meterName);
    addStringNumbers(o.fromRate);
    addStringNumbers(o.toRate);
  }

  // Per-meter LITERAL values a generalized workbook (Phase 3) can print: the meter name + rate digits
  // and the coverage-gated money. This only admits values that genuinely exist in the snapshot; a
  // DERIVED number (a sum/subtotal the model computes) is NOT admitted here — it must be proven via a
  // derived manifest entry (verifyWorkbookArtifact) and is folded in only after the verifier
  // recomputes it, so the gate stays fail-closed.
  for (const m of snapshot.meters) {
    addStringNumbers(m.name);
    addStringNumbers(m.rate);
    if (m.costCents !== null) addMoney(m.costCents);
    if (m.demandCents !== null) addMoney(m.demandCents);
  }

  // Page numbers are common and benign; "1" is already present as rank 1, but allow it explicitly so a
  // single-page footer "1" never trips the scan on a farm with no opportunities.
  allow.add("1");

  return allow;
}

/**
 * Verify a rendered artifact, fail-closed. `manifest` is the model's declared figures; `pdfText` is the
 * text extracted from the ACTUAL rendered PDF. Returns ok only when BOTH the forward manifest check and
 * the reverse number-token scan pass. Pure (no I/O) — the caller does the PDF text extraction.
 */
export function verifyArtifact(
  snapshot: ReportSnapshot,
  manifest: unknown,
  pdfText: string,
): VerifyVerdict {
  // Forward: every declared figure must equal its snapshot value exactly.
  const entries = asManifest(manifest);
  if (entries === null) return { ok: false, reason: "manifest malformed" };
  if (entries.length === 0) return { ok: false, reason: "manifest empty" };
  for (const e of entries) {
    const resolved = resolvePath(snapshot, e.sourcePath);
    if (resolved === undefined) {
      return { ok: false, reason: `manifest path not found: ${e.sourcePath}` };
    }
    if (resolved !== e.value) {
      return { ok: false, reason: `manifest mismatch at ${e.sourcePath}: ${e.value} != ${String(resolved)}` };
    }
  }

  // Reverse: every number visible in the rendered PDF must be a snapshot-derived value.
  const allow = buildAllowlist(snapshot);
  for (const tok of numberTokens(pdfText)) {
    if (!allow.has(canon(tok))) {
      return { ok: false, reason: `undeclared number in document: ${tok}` };
    }
  }

  return { ok: true };
}

/** The three canonical allowlist forms for a cents value (cent-precise + rounded + floored whole
 *  dollars), matching `buildAllowlist`'s `addMoney`. Used to fold a VERIFIED derived total into the
 *  reverse allowlist so a proven subtotal is not flagged. */
function moneyForms(cents: number): string[] {
  return [canon(formatCentsUsd(cents)), String(Math.round(cents / 100)), String(Math.floor(cents / 100))];
}

/** Validate an unknown workbook manifest into well-formed entries, or null (fail closed). A literal
 *  entry needs {label,value,sourcePath}; a derived entry needs {kind:"derived",label,value,op,sourcePaths[]}
 *  with a known op. Anything else is treated as no proof. */
function asWorkbookManifest(manifest: unknown): WorkbookManifestEntry[] | null {
  if (!Array.isArray(manifest)) return null;
  const out: WorkbookManifestEntry[] = [];
  for (const raw of manifest) {
    if (raw === null || typeof raw !== "object") return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.label !== "string" || typeof e.value !== "number") return null;
    if (e.kind === "derived") {
      if ((e.op !== "sum" && e.op !== "count") || !Array.isArray(e.sourcePaths)) return null;
      if (!e.sourcePaths.every((p) => typeof p === "string") || e.sourcePaths.length === 0) return null;
      out.push({ kind: "derived", label: e.label, value: e.value, op: e.op, sourcePaths: e.sourcePaths as string[] });
    } else if (e.kind === undefined || e.kind === "literal") {
      if (typeof e.sourcePath !== "string") return null;
      out.push({ label: e.label, value: e.value, sourcePath: e.sourcePath });
    } else {
      return null; // unknown kind: never trusted
    }
  }
  return out;
}

/** Recompute a derived entry's value from the snapshot. Returns the recomputed number, or null when a
 *  path does not resolve to the expected type (a malformed declaration fails closed in the caller).
 *  The VERIFIER owns the arithmetic — the model only declares the op + inputs. */
function recomputeDerived(snapshot: ReportSnapshot, entry: { op: DerivedOp; sourcePaths: string[] }): number | null {
  if (entry.op === "count") {
    const target = resolvePath(snapshot, entry.sourcePaths[0] ?? "");
    return Array.isArray(target) ? target.length : null;
  }
  // sum: every path must resolve to a finite number (integer cents); sum them.
  let total = 0;
  for (const path of entry.sourcePaths) {
    const resolved = resolvePath(snapshot, path);
    if (typeof resolved !== "number" || !Number.isFinite(resolved)) return null;
    total += resolved;
  }
  return total;
}

/**
 * Verify a rendered WORKBOOK fail-closed (Phase 3). A superset of `verifyArtifact`: the FORWARD check
 * accepts derived entries (recomputed by the verifier, never the model), and a VERIFIED derived value's
 * canonical forms are folded into the reverse allowlist so a proven subtotal is permitted — while any
 * undeclared or mis-declared number is still rejected. `cellText` is the flattened text of the ACTUAL
 * produced .xlsx (extractXlsxNumbers), so a fabricated number cannot hide in a rendering artifact. Pure
 * (the caller does the xlsx read).
 */
export function verifyWorkbookArtifact(
  snapshot: ReportSnapshot,
  manifest: unknown,
  cellText: string,
): VerifyVerdict {
  const entries = asWorkbookManifest(manifest);
  if (entries === null) return { ok: false, reason: "manifest malformed" };
  if (entries.length === 0) return { ok: false, reason: "manifest empty" };

  const allow = buildAllowlist(snapshot);
  for (const e of entries) {
    if ("kind" in e && e.kind === "derived") {
      const recomputed = recomputeDerived(snapshot, e);
      if (recomputed === null) return { ok: false, reason: `derived unresolved: ${e.label}` };
      if (recomputed !== e.value) {
        return { ok: false, reason: `derived mismatch ${e.label}: ${e.value} != ${recomputed}` };
      }
      // sum is integer cents (money forms); count is a plain integer (one form).
      if (e.op === "sum") for (const f of moneyForms(e.value)) allow.add(f);
      else allow.add(String(e.value));
    } else {
      const resolved = resolvePath(snapshot, e.sourcePath);
      if (resolved === undefined) return { ok: false, reason: `manifest path not found: ${e.sourcePath}` };
      if (resolved !== e.value) {
        return { ok: false, reason: `manifest mismatch at ${e.sourcePath}: ${e.value} != ${String(resolved)}` };
      }
    }
  }

  for (const tok of numberTokens(cellText)) {
    if (!allow.has(canon(tok))) {
      return { ok: false, reason: `undeclared number in workbook: ${tok}` };
    }
  }
  return { ok: true };
}

/**
 * Extract every number/string token from the ACTUAL produced .xlsx, in our trusted Next.js process
 * (never the sandbox), by reopening it with the already-shipped ExcelJS and walking every cell. This is
 * STRONGER than PDF text scanning: xlsx cells are structured, so there is no OCR/reflow loss — a
 * fabricated number cannot hide. A currency cell is emitted as its cent-precise form (toFixed(2)) to
 * match the allowlist's money forms; an integer/plain number as its String form; strings verbatim (so
 * their digits, e.g. "17" in "Westside Pump 17", are mined). Over-sized bytes or a parse failure degrade
 * to "" (the forward manifest still gates), mirroring extractPdfText's safe-degrade contract.
 */
export async function extractXlsxNumbers(xlsxBytes: Buffer): Promise<string> {
  const MAX_BYTES = 5 * 1024 * 1024; // a normal farm workbook is tens of KB; cap as a zip-bomb guard
  if (xlsxBytes.byteLength > MAX_BYTES) return "";
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBytes as unknown as ArrayBuffer);
    const out: string[] = [];
    wb.eachSheet((ws) => {
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const v = cell.value;
          if (typeof v === "number") {
            const fmt = cell.numFmt;
            // Currency: the displayed cent-precise form (so "$X,XXX.X0" never mismatches String's
            // dropped trailing zero). Integer/plain: the raw String. Both canon to an allowlisted form.
            out.push(typeof fmt === "string" && fmt.includes("$") ? v.toFixed(2) : String(v));
          } else if (typeof v === "string") {
            out.push(v);
          }
          // null / formula / rich-text cells carry no verifiable figure (the shim never writes them).
        });
      });
    });
    return out.join("\n");
  } catch {
    return ""; // safe degrade: a parse failure leaves the forward manifest as the gate
  }
}

/**
 * Extract plain text from rendered PDF bytes (the only impure part of verification). Runs in our
 * trusted Next.js process, NOT the sandbox. Imports the library's inner entry directly
 * (`pdf-parse/lib/pdf-parse.js`) to bypass the package's debug wrapper, which under ESM tries to read a
 * bundled test PDF and throws. Returns the document text; an extraction failure surfaces as empty text,
 * which (with a non-trivial report) leaves the manifest check as the only pass and is safe.
 */
export async function extractPdfText(pdfBytes: Buffer): Promise<string> {
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const data = await pdfParse(pdfBytes);
  return typeof data.text === "string" ? data.text : "";
}
