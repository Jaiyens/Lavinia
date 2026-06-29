// PDF -> text for grower report documents (Almond Logic settlement / commitment PDFs). The ZDR
// settlement and commitment readers consume the document's TEXT layer (passed as a text part to the
// zero-data-retention model), so this is the one place a report PDF's bytes become a string.
//
// It reuses the SAME dependency the bill engine relies on (`pdf-parse`), imported by its INNER entry
// (`pdf-parse/lib/pdf-parse.js`) — the package root runs a debug block under ESM dynamic import that
// reads a bundled test PDF and throws, so the inner entry is the plain `(buffer) => Promise<{ text }>`
// parser (see src/types/pdf-parse.d.ts). No NEW dependency is added.
//
// The extractor is INJECTABLE: `pdfToText` takes an optional parser so tests pass committed TEXT
// fixtures with zero PDF bytes and zero parse, exactly like the rest of the crop extract pipeline
// runs zero-call in dev/CI. The default parser is loaded lazily so importing this module on a machine
// without the dependency resolved at import time is inert until first real use.

/** The minimal PDF-parse surface this module needs: bytes in, extracted text out. */
export type PdfTextParser = (bytes: Uint8Array) => Promise<{ text: string }>;

/** Lazily import the inner pdf-parse entry on first real use (keeps import-time side effects out). */
let cachedParser: PdfTextParser | null = null;
async function defaultParser(bytes: Uint8Array): Promise<{ text: string }> {
  if (!cachedParser) {
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const parse = mod.default;
    cachedParser = async (b) => {
      const result = await parse(b);
      return { text: result.text };
    };
  }
  return cachedParser(bytes);
}

/**
 * Extract the text layer of a report PDF. Pass `parser` to inject a fake (tests) or an alternate
 * extractor; omit it to use the lazily-loaded `pdf-parse`. The returned text is what the ZDR reader
 * reads — never a parsed-out figure (no pound number is derived here; that is the model + gate's job).
 */
export async function pdfToText(
  bytes: Uint8Array,
  parser: PdfTextParser = defaultParser,
): Promise<string> {
  const { text } = await parser(bytes);
  return text;
}
