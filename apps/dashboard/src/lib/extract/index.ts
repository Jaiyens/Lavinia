// The raw-extraction (RawExtraction) layer: Zod schemas for each PG&E bill page type.
// The Zod schema is the source of truth; the TS types are `z.infer` of it. Never import
// these raw types into /app - /app reads only the canonical shape in @/lib/normalize
// (the no-raw-source-in-ui guard enforces the boundary).
export * from "./schema";
export { splitPdfPages } from "./split";
export { type PageReader, stubPageReader, createGatewayReader, hasGatewayKey } from "./reader";
export { extractBill, type ExtractedPage } from "./pipeline";
