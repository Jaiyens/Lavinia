// Minimal ambient types for `pdf-parse`. We import the library's INNER entry
// (`pdf-parse/lib/pdf-parse.js`) rather than the package root, because the root `index.js` runs a
// debug block when `module.parent` is falsy (true under ESM dynamic import) that reads a bundled test
// PDF and throws. The inner entry is the plain `(buffer) => Promise<{ text, ... }>` parser. The package
// ships no types, so we declare just the surface we use.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    /** The extracted text of the whole document. */
    text: string;
    /** Number of pages. */
    numpages: number;
    /** Raw PDF info dictionary (untyped). */
    info: unknown;
    /** PDF metadata (untyped, may be null). */
    metadata: unknown;
    /** The pdf.js version used. */
    version: string;
  }
  function pdfParse(dataBuffer: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
