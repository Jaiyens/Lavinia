import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import type { UIMessage } from "ai";
import { parseSpreadsheetAttachments, stripFileAttachments } from "./parse";

/** Build a one-sheet xlsx as a base64 Data URL, like the browser sends from `sendMessage({ files })`. */
async function xlsxDataUrl(rows: (string | number)[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Meters");
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf as ArrayBuffer).toString("base64");
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
}

function csvDataUrl(csv: string): string {
  return `data:text/csv;base64,${Buffer.from(csv, "utf-8").toString("base64")}`;
}

function userMessage(parts: UIMessage["parts"]): UIMessage {
  return { id: "u1", role: "user", parts } as UIMessage;
}

function textOf(m: UIMessage): string {
  return (m.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n");
}

/** First message, asserting it exists (keeps `noUncheckedIndexedAccess` happy in tests). */
function first(messages: UIMessage[]): UIMessage {
  const m = messages[0];
  if (m === undefined) throw new Error("expected at least one message");
  return m;
}

describe("parseSpreadsheetAttachments", () => {
  it("turns an attached xlsx into a text table the model can read", async () => {
    const url = await xlsxDataUrl([
      ["Meter", "Rate", "Cost"],
      ["Pump 17", "AG-4", 1234],
    ]);
    const out = await parseSpreadsheetAttachments([
      userMessage([
        { type: "text", text: "What is in this file?" },
        { type: "file", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "meters.xlsx", url },
      ]),
    ]);
    // The file part is replaced by a text part; no file part survives.
    expect(first(out).parts.some((p) => p.type === "file")).toBe(false);
    const text = textOf(first(out));
    expect(text).toContain("meters.xlsx");
    expect(text).toContain("Pump 17");
    expect(text).toContain("AG-4");
    expect(text).toContain('Sheet "Meters"');
  });

  it("parses a CSV attachment and preserves the original question", async () => {
    const out = await parseSpreadsheetAttachments([
      userMessage([
        { type: "text", text: "Summarize this." },
        { type: "file", mediaType: "text/csv", filename: "bill.csv", url: csvDataUrl("a,b\n1,2\n3,4") },
      ]),
    ]);
    const text = textOf(first(out));
    expect(text).toContain("Summarize this.");
    expect(text).toContain("bill.csv");
    expect(text).toContain("1,2");
    expect(text).toContain("(3 rows)");
  });

  it("announces truncation instead of silently dropping rows", async () => {
    const big = Array.from({ length: 500 }, (_, i) => `${i},row`).join("\n");
    const out = await parseSpreadsheetAttachments([
      userMessage([{ type: "file", mediaType: "text/csv", filename: "big.csv", url: csvDataUrl(big) }]),
    ]);
    expect(textOf(first(out))).toContain("showing first 200 of 500 rows");
  });

  it("leaves PDF and image attachments untouched for native model reading", async () => {
    const input = [
      userMessage([
        { type: "text", text: "Read this bill." },
        { type: "file", mediaType: "application/pdf", filename: "bill.pdf", url: "data:application/pdf;base64,JVBERi0=" },
      ]),
    ];
    const out = await parseSpreadsheetAttachments(input);
    // Nothing to parse -> the original array reference is returned and the PDF file part survives.
    expect(out).toBe(input);
    expect(first(out).parts.some((p) => p.type === "file")).toBe(true);
  });
});

describe("stripFileAttachments", () => {
  it("removes file parts (non-owner / public Tour) but keeps text", () => {
    const out = stripFileAttachments([
      userMessage([
        { type: "text", text: "hi" },
        { type: "file", mediaType: "application/pdf", filename: "x.pdf", url: "data:application/pdf;base64,JVBERi0=" },
      ]),
    ]);
    expect(first(out).parts.some((p) => p.type === "file")).toBe(false);
    expect(textOf(first(out))).toContain("hi");
  });

  it("returns the same reference when there is nothing to strip", () => {
    const input = [userMessage([{ type: "text", text: "hi" }])];
    expect(stripFileAttachments(input)).toBe(input);
  });
});
