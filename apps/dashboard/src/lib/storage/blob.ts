import { randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";

/**
 * The thin storage seam over Vercel Blob (Story 8.6). Everything Almond's reports persistence
 * writes goes through here, so the "PRIVATE, never a public URL" law lives in ONE place:
 *
 *   - `putPrivateBlob` writes bytes to a PRIVATE blob (`access: "private"`) under a non-guessable
 *     cuid key. A private blob is not reachable by guessing a URL; it can only be read back through
 *     `getPrivateBlob` with the store's read-write token, behind the owner-scoped download route.
 *     We pass `addRandomSuffix: false` because the cuid key is ALREADY unique and non-guessable, so
 *     the pathname we record (`blobPathname`) is the exact key we read back later (no suffix drift),
 *     and `allowOverwrite: false` so a (cuid-collision-impossible) repeat can never silently
 *     clobber an existing blob — immutability is enforced at the store, not just in the row.
 *
 *   - `getPrivateBlob` streams the bytes back for a given pathname. The route re-checks farm
 *     ownership FIRST, then calls this; the SDK attaches the authorization header from the
 *     read-write token, so a private blob is never served to an unauthenticated fetch of its URL.
 *
 * Token: `@vercel/blob` reads `BLOB_READ_WRITE_TOKEN` from the environment; we never pass it
 * explicitly, so the secret never crosses a function boundary or appears in a log line. There are
 * zero external calls in the unit tests — this module is only ever exercised against a real store
 * (the *.db.test.ts is authored but not run in CI/the overnight pass).
 */

/** The content type written for an .xlsx workbook (the only report kind in v1). */
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A non-guessable storage key under a stable prefix, e.g. "reports/<uuid>.xlsx". The random uuid
 *  (the repo's existing unguessable-id primitive, `node:crypto`) is the unguessable part; the prefix
 *  and extension are cosmetic (the blob is private regardless of the key). A guessed pathname still
 *  cannot read the bytes: the blob is private and the download route re-checks farm ownership. */
export function newReportBlobKey(extension = "xlsx"): string {
  return `reports/${randomUUID()}.${extension}`;
}

/** What a private write returns to the caller: the exact pathname the bytes live under (recorded as
 *  GeneratedReport.blobPathname) and their size. The URL is deliberately NOT surfaced — a private
 *  blob is read back by pathname through the owner-scoped route, never by handing out a URL. */
export type StoredBlob = {
  pathname: string;
  byteSize: number;
};

/**
 * Write bytes to a PRIVATE blob under `pathname` and return the stored pathname + size. Private
 * (`access: "private"`), no random suffix (the cuid key is already unique), no overwrite (a stored
 * blob is immutable — a refresh writes a NEW key). The byte size is taken from the buffer, not the
 * SDK result, so the recorded size is exactly what we wrote.
 */
export async function putPrivateBlob(
  pathname: string,
  bytes: Uint8Array,
  contentType: string = XLSX_CONTENT_TYPE,
): Promise<StoredBlob> {
  const body = Buffer.from(bytes);
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
  });
  return { pathname, byteSize: body.byteLength };
}

/**
 * Stream a PRIVATE blob's bytes back by pathname. Returns the readable stream plus the content type
 * and size for the response headers, or null when the blob does not exist (the route turns that
 * into a 404). The caller MUST have already re-checked farm ownership; this only fetches the bytes.
 * `useCache: false` so the latest bytes are always fetched from origin (a report's bytes never
 * change, but a private blob should not be served from a shared CDN cache).
 */
export type PrivateBlobStream = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  byteSize: number;
};

export async function getPrivateBlob(pathname: string): Promise<PrivateBlobStream | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  // Not found, or a 304 (no body) — neither is a streamable file here, so treat as absent.
  if (result === null || result.statusCode !== 200) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType,
    byteSize: result.blob.size,
  };
}
