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

/** Extract number tokens from arbitrary text. Matches an optional leading minus and `$`, then a digit
 *  group with optional thousands separators and an optional decimal — but NOT a run of digits that is
 *  part of an alphanumeric token (e.g. the "1" in a rate code like "AG-A1"), via the leading boundary.
 *  The optional `-?` makes the scan SIGN-AWARE: a negative cell renders "-50.00" and tokenizes to
 *  "-50.00" (canon keeps the sign), so a sign-flipped fabrication can no longer pass as its positive
 *  snapshot value, and an honest negative (a NEM credit / refund) matches its signed allowlist form. A
 *  hyphen INSIDE an identifier ("Pump-17") is not a sign: the match there starts at "17" (the char
 *  before it is "-", a non-alphanumeric boundary), exactly as before. */
function numberTokens(text: string): string[] {
  const re = /(?<![A-Za-z0-9])-?\$?\d[\d,]*(?:\.\d+)?/g;
  return text.match(re) ?? [];
}

/** Add the money/dollar forms of an integer-cents value: the cent-precise form plus the rounded and
 *  floored whole dollars (a report may show "$61,417.76" or "$61,418" or "$61,418.00"). Matches the way
 *  a `$` cell scans (extractXlsxNumbers does `(cents/100).toFixed(2)`) and how a PDF prints a rounded
 *  figure, so a legitimately-rendered money value is never flagged as fabricated. */
function addMoneyForms(allow: Set<string>, cents: number): void {
  allow.add(canon(formatCentsUsd(cents))); // "61417.76"
  allow.add(String(Math.round(cents / 100))); // rounded whole dollars
  allow.add(String(Math.floor(cents / 100))); // floored whole dollars
  // ...and the whole-dollar forms WITH trailing cents (a report may show "$61,418.00").
  allow.add(`${Math.round(cents / 100)}.00`);
  allow.add(`${Math.floor(cents / 100)}.00`);
}

/**
 * Build the allowlist of canonical number strings every figure in the rendered artifact is permitted to
 * be — the ONE GENERAL NUMBER GUARD. It RECURSIVELY walks the WHOLE snapshot (objects, arrays,
 * primitives), so EVERY number anywhere in it is admitted; there is no per-field list to keep in sync
 * with the snapshot shape (the bug that left a comprehensive snapshot's entity/ranch/gpm/kW numbers out
 * of the allowlist and rejected an honest sheet). For each value, tracking the current KEY name:
 *   - a NUMBER is always admitted as `String(n)`. When its key ends in "Cents" it is integer cents, so
 *     its money/dollar forms are ALSO admitted (a $-cell rendered from cents passes); otherwise it is a
 *     plain quantity (gpm, kW, count, a percent), so its ROUNDED form is also admitted (Excel rounds an
 *     integer-format cell).
 *   - a STRING has its embedded number tokens mined (so "Westside Pump 17" admits "17", and the coverage
 *     date "2026-06-20" admits its year/month/day, which a dated report prints).
 *
 * FAIL-CLOSED property preserved: a number that appears NOWHERE in the snapshot (a fabricated/invented
 * farm number) is still rejected. The walk only WIDENS the allowlist with values that genuinely exist in
 * the snapshot tree; it never admits a value not present, so an invented number can never pass. The
 * snapshot is plain serializable JSON (no Dates, no cycles), so the recursion terminates.
 */
export function buildAllowlist(snapshot: ReportSnapshot): Set<string> {
  const allow = new Set<string>();

  const visit = (value: unknown, key: string): void => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return;
      allow.add(String(value));
      if (key.endsWith("Cents")) {
        // Integer cents: admit the dollar forms so a $-cell / a rounded dollar figure passes.
        addMoneyForms(allow, value);
      } else {
        // A plain quantity (gpm, kW, a count): Excel rounds an integer-format cell, so the rounded
        // display value must also pass.
        allow.add(String(Math.round(value)));
        // A FRACTION in (-1, 1) is a share (e.g. sharePct 0.7234, uncoveredShare): the chat states it as
        // a percent, so a sheet/report may too. Admit its percent forms ("72", "72.34") so an honest
        // percent is not flagged. Derived from a real snapshot value, so fail-closed still holds.
        if (value !== 0 && Math.abs(value) < 1) {
          const pct = value * 100;
          allow.add(String(Math.round(pct)));
          allow.add(canon(pct.toFixed(2)));
        }
      }
      return;
    }
    if (typeof value === "string") {
      for (const tok of numberTokens(value)) allow.add(canon(tok));
      return;
    }
    if (Array.isArray(value)) {
      // Array elements inherit the PARENT key, so a `...Cents` array (if one ever appears) keeps its
      // money interpretation; an index is not a meaningful key.
      for (const item of value) visit(item, key);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, k);
      return;
    }
    // null / boolean / undefined: nothing to admit.
  };

  visit(snapshot, "");

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

/** All the canonical allowlist forms for a cents value, IDENTICAL to `buildAllowlist`'s `addMoneyForms`
 *  (cent-precise + rounded/floored whole dollars + their ".00" forms). Reuses the same helper so the
 *  widen path and the base allowlist can never drift (a proven derived total printed as "$61,418.00" is
 *  admitted just like a base value). Used to fold a VERIFIED derived total into the reverse allowlist. */
function moneyForms(cents: number): string[] {
  const forms = new Set<string>();
  addMoneyForms(forms, cents);
  return [...forms];
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
  // sum: every path must (a) be DISTINCT — no path may repeat, so a model cannot double-count one
  // real value into an inflated total — (b) point at a money field (its key ends in "Cents"), so a
  // sum can only aggregate dollars, never structural integers (rank / meterCount / coverage counts),
  // and (c) resolve to a finite number (integer cents). Any violation fails closed.
  const seen = new Set<string>();
  let total = 0;
  for (const path of entry.sourcePaths) {
    if (seen.has(path)) return null; // duplicate path -> reject (anti double-count)
    seen.add(path);
    if (!path.endsWith("Cents")) return null; // sum only money fields
    const resolved = resolvePath(snapshot, path);
    if (typeof resolved !== "number" || !Number.isFinite(resolved)) return null;
    total += resolved;
  }
  return total;
}

/**
 * Verify a rendered WORKBOOK / report fail-closed. The REVERSE number-token scan is the authoritative
 * gate: every number visible in the produced file (`cellText` from extractXlsxNumbers, or extractPdfText)
 * must be a snapshot-derived value, so a fabricated dollar can never reach the grower — this scales to a
 * full data dump (every meter's real cost) because the allowlist is built from the WHOLE snapshot.
 *
 * The manifest is OPTIONAL and only WIDENS the allowlist for a number the model legitimately COMPUTED and
 * that is not a raw snapshot value (a sum/count total, or a snapshot field the default allowlist does not
 * enumerate). It is NON-FATAL: an absent, empty, malformed, unresolved, or mismatched manifest entry just
 * fails to widen — it never rejects the workbook on its own, because the reverse scan still catches any
 * genuinely-unverifiable number. (Before this, a missing/imperfect manifest rejected an otherwise-correct
 * data dump, which is why a real 183-meter export could never pass.) A VERIFIED derived value is folded in
 * only after the VERIFIER recomputes it, so the model can never supply the arithmetic. Pure (no I/O).
 */
export function verifyWorkbookArtifact(
  snapshot: ReportSnapshot,
  manifest: unknown,
  cellText: string,
): VerifyVerdict {
  // A malformed manifest is treated as NO manifest (the reverse scan is the gate), not a rejection.
  const entries = asWorkbookManifest(manifest) ?? [];

  const allow = buildAllowlist(snapshot);
  for (const e of entries) {
    if ("kind" in e && e.kind === "derived") {
      // Widen ONLY when the verifier itself recomputes the same value; otherwise skip (non-fatal).
      const recomputed = recomputeDerived(snapshot, e);
      if (recomputed !== null && recomputed === e.value) {
        // sum is integer cents (money forms); count is a plain integer (one form).
        if (e.op === "sum") for (const f of moneyForms(e.value)) allow.add(f);
        else allow.add(String(e.value));
      }
    } else {
      // A literal entry points at a raw snapshot value; widen with it (covers a snapshot field the
      // default allowlist does not enumerate). Non-fatal if it does not resolve or match.
      const resolved = resolvePath(snapshot, e.sourcePath);
      if (typeof resolved === "number" && resolved === e.value) {
        for (const f of moneyForms(e.value)) allow.add(f);
        allow.add(String(e.value));
      }
    }
  }

  for (const tok of numberTokens(cellText)) {
    if (!allow.has(canon(tok))) {
      return { ok: false, reason: `undeclared number in document: ${tok}` };
    }
  }
  return { ok: true };
}

/** The largest COMPRESSED .xlsx we will even open (a normal farm workbook is tens of KB). */
const MAX_XLSX_COMPRESSED = 10 * 1024 * 1024;
/** The largest total UNCOMPRESSED size we will decompress in-process (decompression-bomb guard). */
const MAX_XLSX_UNCOMPRESSED = 50 * 1024 * 1024;

/**
 * Sum the DECLARED uncompressed size of every entry in a .xlsx (a zip) by parsing the central
 * directory, WITHOUT decompressing anything — so a decompression bomb is caught before ExcelJS ever
 * inflates it. Returns null when the zip cannot be parsed or uses a ZIP64 size marker (0xFFFFFFFF) we
 * refuse to trust — both fail closed in the caller. Pure Buffer arithmetic, no allocation of payloads.
 */
function zipUncompressedTotal(bytes: Buffer): number | null {
  const EOCD_SIG = 0x06054b50;
  const CDH_SIG = 0x02014b50;
  const ZIP64_MARK = 0xffffffff;
  try {
    // Find the End Of Central Directory record, scanning back from the tail (xlsx carries no comment,
    // but bound the scan to the 64KB max-comment window regardless).
    let eocd = -1;
    const earliest = Math.max(0, bytes.length - 22 - 0xffff);
    for (let i = bytes.length - 22; i >= earliest; i--) {
      if (bytes.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;

    const count = bytes.readUInt16LE(eocd + 10);
    let offset = bytes.readUInt32LE(eocd + 16);
    if (offset === ZIP64_MARK || count === 0xffff) return null; // ZIP64: refuse to trust
    let total = 0;
    for (let n = 0; n < count; n++) {
      if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== CDH_SIG) return null;
      const uncompressed = bytes.readUInt32LE(offset + 24);
      if (uncompressed === ZIP64_MARK) return null; // a ZIP64-marked size could hide a bomb: reject
      total += uncompressed;
      if (total > MAX_XLSX_UNCOMPRESSED) return total; // already over the cap; no need to keep summing
      const nameLen = bytes.readUInt16LE(offset + 28);
      const extraLen = bytes.readUInt16LE(offset + 30);
      const commentLen = bytes.readUInt16LE(offset + 32);
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return total;
  } catch {
    return null;
  }
}

/**
 * Extract every number/string token from the ACTUAL produced .xlsx, in our trusted Next.js process
 * (never the sandbox), by reopening it with the already-shipped ExcelJS and walking every cell. This is
 * STRONGER than PDF text scanning: xlsx cells are structured, so there is no OCR/reflow loss.
 *
 * Returns NULL = "do not trust this file" (the caller falls back to the deterministic workbook), for:
 *   - a COMPRESSED file over the cap, or a DECLARED-UNCOMPRESSED total over the cap / unparsable zip /
 *     ZIP64 marker — the decompression-bomb guard, BEFORE ExcelJS inflates anything (a V8 OOM is a
 *     fatal, uncatchable process abort, so the size must be bounded up front, not via try/catch);
 *   - a FORMULA / Date / rich-text / hyperlink (object-valued) cell — the trusted shim never writes
 *     one, so its presence means the model smuggled a formula (e.g. a "=99999" string openpyxl turned
 *     into a formula) whose computed value Excel would DISPLAY but a cell-value scan would miss;
 *   - any parse failure.
 * Returns a STRING of tokens on success: a currency cell as its cent-precise form (toFixed(2), so a
 * trailing-zero cent never mismatches); an integer-format cell as its ROUNDED display value (Excel
 * rounds "#,##0"); strings verbatim (so their digits, e.g. "17" in "Westside Pump 17", are mined). An
 * empty (but valid) workbook yields "" (the forward manifest still gates).
 */
export async function extractXlsxNumbers(xlsxBytes: Buffer): Promise<string | null> {
  if (xlsxBytes.byteLength > MAX_XLSX_COMPRESSED) return null;
  const uncompressed = zipUncompressedTotal(xlsxBytes);
  if (uncompressed === null || uncompressed > MAX_XLSX_UNCOMPRESSED) return null;
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBytes as unknown as ArrayBuffer);
    const out: string[] = [];
    let opaque = false;
    wb.eachSheet((ws) => {
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const v = cell.value;
          if (typeof v === "number") {
            const fmt = typeof cell.numFmt === "string" ? cell.numFmt : "";
            // Currency ($): the displayed cent-precise form. Integer-style numFmt (contains a "0"
            // pattern, no "$"): the ROUNDED display value (Excel rounds "#,##0"), so the scanned token
            // equals what the grower sees. General/no-format: the raw value.
            if (fmt.includes("$")) out.push(v.toFixed(2));
            else if (fmt.includes("0")) out.push(String(Math.round(v)));
            else out.push(String(v));
          } else if (typeof v === "string") {
            out.push(v);
          } else if (v !== null && v !== undefined && typeof v !== "boolean") {
            // A formula/Date/rich-text/hyperlink cell: the trusted shim never emits one, so treat its
            // presence as a smuggled value and fail closed (the displayed result would not be scanned).
            opaque = true;
          }
        });
      });
    });
    if (opaque) return null;
    return out.join("\n");
  } catch {
    return null; // a parse failure on a trusted-shim file is anomalous: fail closed, not forward-only
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
  try {
    const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(pdfBytes);
    return typeof data.text === "string" ? data.text : "";
  } catch {
    // Honor the documented contract: an extraction failure surfaces as empty text (the manifest check
    // remains authoritative) rather than throwing out of the verifier.
    return "";
  }
}
