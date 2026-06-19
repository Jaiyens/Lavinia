import ExcelJS from "exceljs";
import type { UIMessage } from "ai";

/**
 * Server-side preparation of a grower's chat attachments (the "read as context" channel).
 *
 * PDFs and images ride through untouched: `convertToModelMessages` turns them into model
 * document/image parts the model reads natively. Spreadsheets can't be read as bytes, so here we
 * parse an attached `.xlsx`/`.xls`/`.csv` into a compact text table and REPLACE the file part with a
 * text part, so the model sees the rows. Attachments never mutate farm data — this is read-only
 * context (mirroring Almond's read-only law).
 *
 * Honesty: a sheet is capped at `MAX_ROWS` x `MAX_COLS`; when a sheet is larger we say so in the
 * header ("showing first N of M rows") rather than silently truncating (Epic 8 no-silent-truncation
 * law). The route runs this ONLY for an authed owner; for the public Tour it strips file parts
 * entirely (`stripFileAttachments`), so untrusted callers can never push file bytes into the model.
 */

// Per-sheet caps so one giant export can't blow the model's context window. Generous enough for a
// real bill or meter export; truncation past these is announced, never silent.
const MAX_ROWS = 200;
const MAX_COLS = 40;
const MAX_CELL_CHARS = 200;

const XLSX_MIMES: ReadonlySet<string> = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const CSV_MIMES: ReadonlySet<string> = new Set(["text/csv", "application/csv"]);

type SpreadsheetKind = "xlsx" | "csv";

/** Classify a file part as a spreadsheet by media type, falling back to its filename extension
 *  (browsers sometimes send a generic `application/octet-stream` for `.xlsx`/`.csv`). Returns null
 *  for anything else (PDFs, images), which is left for the model to read natively. */
function spreadsheetKind(mediaType: string, filename?: string): SpreadsheetKind | null {
  if (XLSX_MIMES.has(mediaType)) return "xlsx";
  if (CSV_MIMES.has(mediaType)) return "csv";
  const lower = (filename ?? "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

/** Decode a Data URL (`data:<mime>;base64,<data>` or url-encoded) to bytes. Returns null for a
 *  hosted (http) url or a malformed value. Runs in the Node route, so `Buffer` is available. */
function dataUrlToBytes(url: string): Uint8Array | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const meta = url.slice(5, comma);
  const data = url.slice(comma + 1);
  try {
    if (meta.includes("base64")) return new Uint8Array(Buffer.from(data, "base64"));
    return new Uint8Array(Buffer.from(decodeURIComponent(data), "utf-8"));
  } catch {
    return null;
  }
}

/** A single cell's value as short plain text (exceljs cells can be strings, numbers, dates, formula
 *  results, hyperlinks, or rich text). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, MAX_CELL_CHARS);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.slice(0, MAX_CELL_CHARS);
    if (typeof o.result === "string" || typeof o.result === "number") {
      return String(o.result).slice(0, MAX_CELL_CHARS);
    }
    if (Array.isArray(o.richText)) {
      return o.richText
        .map((r) => (typeof (r as { text?: unknown }).text === "string" ? (r as { text: string }).text : ""))
        .join("")
        .slice(0, MAX_CELL_CHARS);
    }
    if (typeof o.hyperlink === "string") return o.hyperlink.slice(0, MAX_CELL_CHARS);
  }
  return "";
}

/** Parse an xlsx/xls workbook into a compact, per-sheet text table. */
async function workbookToText(bytes: Uint8Array): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // exceljs types `load` against the legacy non-generic `Buffer`; Node's `Buffer.from` now returns
  // `Buffer<ArrayBuffer>`, so bridge the @types/node mismatch with the method's own param type.
  await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const blocks: string[] = [];
  wb.eachSheet((sheet) => {
    const total = sheet.rowCount;
    const lines: string[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > MAX_ROWS) return;
      const raw = Array.isArray(row.values) ? row.values.slice(1, 1 + MAX_COLS) : [];
      lines.push(raw.map(cellText).join(", "));
    });
    const header =
      total > MAX_ROWS
        ? `Sheet "${sheet.name}" (showing first ${MAX_ROWS} of ${total} rows):`
        : `Sheet "${sheet.name}" (${total} ${total === 1 ? "row" : "rows"}):`;
    blocks.push([header, ...lines].join("\n"));
  });
  return blocks.length > 0 ? blocks.join("\n\n") : "(empty workbook)";
}

/** Parse a CSV into a capped block of lines, announcing truncation when it ran long. */
function csvToText(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split(/\r?\n/);
  // Drop a trailing empty line so a file ending in a newline doesn't read as one row longer.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const total = lines.length;
  const kept = lines.slice(0, MAX_ROWS);
  const header =
    total > MAX_ROWS
      ? `(showing first ${MAX_ROWS} of ${total} rows):`
      : `(${total} ${total === 1 ? "row" : "rows"}):`;
  return [header, ...kept].join("\n");
}

/**
 * Replace spreadsheet/CSV file parts in the conversation with parsed text parts, leaving every other
 * part (text, PDF/image file parts, tool parts) untouched. Returns the original array reference when
 * nothing changed, so callers can skip downstream work cheaply.
 */
export async function parseSpreadsheetAttachments(messages: UIMessage[]): Promise<UIMessage[]> {
  let changed = false;
  const out = await Promise.all(
    messages.map(async (m) => {
      const parts = m.parts;
      if (!parts || parts.length === 0) return m;
      let touched = false;
      const nextParts = await Promise.all(
        parts.map(async (part) => {
          if (part.type !== "file") return part;
          const kind = spreadsheetKind(part.mediaType, part.filename);
          if (kind === null) return part; // PDF / image -> native model reading
          const bytes = dataUrlToBytes(part.url);
          if (bytes === null) return part;
          const name = part.filename ?? (kind === "csv" ? "attachment.csv" : "attachment.xlsx");
          touched = true;
          try {
            const body = kind === "csv" ? csvToText(bytes) : await workbookToText(bytes);
            return { type: "text" as const, text: `[Attached spreadsheet: ${name}]\n${body}` };
          } catch {
            return { type: "text" as const, text: `[Attached spreadsheet: ${name} - could not be read]` };
          }
        }),
      );
      if (!touched) return m;
      changed = true;
      return { ...m, parts: nextParts };
    }),
  );
  return changed ? out : messages;
}

/**
 * Remove every file part from the conversation. Used for the public Tour (a non-owner), so an
 * untrusted caller can never push file bytes through the model — capability parity with the
 * export/report skills the Tour is never handed.
 */
export function stripFileAttachments(messages: UIMessage[]): UIMessage[] {
  let changed = false;
  const out = messages.map((m) => {
    const parts = m.parts;
    if (!parts || !parts.some((p) => p.type === "file")) return m;
    changed = true;
    return { ...m, parts: parts.filter((p) => p.type !== "file") };
  });
  return changed ? out : messages;
}
