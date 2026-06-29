import { describe, expect, it } from "vitest";
import { pdfToText, type PdfTextParser } from "./pdf-text";

// pdfToText is injectable so the pipeline runs with committed TEXT fixtures and zero PDF bytes (the
// real pdf-parse dependency is never touched in this suite). We assert the injection contract.

describe("pdfToText", () => {
  it("returns the injected parser's text (no real PDF parse)", async () => {
    const fakeParser: PdfTextParser = (bytes) =>
      Promise.resolve({ text: `parsed ${bytes.byteLength} bytes: Nonpareil 120,000` });
    const out = await pdfToText(new Uint8Array([1, 2, 3, 4]), fakeParser);
    expect(out).toBe("parsed 4 bytes: Nonpareil 120,000");
  });

  it("passes the exact bytes through to the parser", async () => {
    let seen: Uint8Array | null = null;
    const spy: PdfTextParser = (bytes) => {
      seen = bytes;
      return Promise.resolve({ text: "ok" });
    };
    const input = new Uint8Array([9, 8, 7]);
    await pdfToText(input, spy);
    expect(seen).toBe(input);
  });
});
