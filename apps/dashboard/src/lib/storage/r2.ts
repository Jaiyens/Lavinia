// The live R2 object-store adapter: an `ObjectStore` over Cloudflare R2's S3-compatible API via
// `@aws-sdk/client-s3`. This is the production backing store for RAW scraped crop pages (the data
// that must NEVER touch Postgres). The in-memory double in object-store.ts stands in for it in tests
// and offline runs, so this file is only ever constructed when real R2 creds are present.
//
// Secret discipline (mirrors src/lib/ai/gateway.ts and src/lib/storage/blob.ts):
//   - Env var NAMES only ever appear here, never values. Nothing is logged.
//   - The client is built LAZILY (first put/get), so importing this module on a creds-less machine
//     (dev/CI) does nothing and throws nothing — the throw-if-missing happens only at moment of use.
//   - `r2Configured()` lets a caller fail closed BEFORE constructing, without reading any value into
//     a log.
//
// Required env (R2 dashboard -> S3 API): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET, R2_ENDPOINT. R2_ENDPOINT is the account S3 endpoint
// (https://<accountid>.r2.cloudflarestorage.com); region is fixed to "auto" per R2's S3 contract.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { ObjectRead, ObjectStore, PutResult } from "./object-store";

/** The env var NAMES this adapter reads. Listed once so the "names only, never values" rule is auditable. */
const R2_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
] as const;

/**
 * Whether every R2 env var is present. Callers (the scrape step's live branch) use this to fail
 * closed before constructing the adapter. Reads env presence only; never logs a value.
 */
export function r2Configured(): boolean {
  return R2_ENV.every((name) => Boolean(process.env[name]));
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

/** Read + validate the R2 config, throwing (with NAMES only) if any var is missing. Never logs values. */
function readR2Config(): R2Config {
  const missing = R2_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`R2 storage not configured: missing ${missing.join(", ")}`);
  }
  // Non-null is safe: the filter above proved each is set. Read by name; values never logged.
  return {
    accountId: process.env.R2_ACCOUNT_ID as string,
    accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    bucket: process.env.R2_BUCKET as string,
    endpoint: process.env.R2_ENDPOINT as string,
  };
}

/**
 * Build the content-addressed key for one raw page:
 *   crop/<farmId>/<entityId>/<cropYear>/<sha>.<ext>
 * The sha makes a re-scrape of identical bytes idempotent (same key), and the path is farm-scoped so
 * a listing can never cross tenants. `ext` defaults to html (the common scraped page); callers pass
 * "pdf" etc. for other payloads.
 */
export function rawPageKey(
  farmId: string,
  entityId: string,
  cropYear: number,
  sha: string,
  ext = "html",
): string {
  return `crop/${farmId}/${entityId}/${cropYear}/${sha}.${ext}`;
}

/**
 * Convert the SDK's GetObject `Body` (a Node Readable / web stream / Blob, depending on runtime)
 * into a web `ReadableStream<Uint8Array>` for the `ObjectRead` contract. The SDK attaches
 * `transformToWebStream()` to the Body in every supported runtime.
 */
function bodyToWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (
    body !== null &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof (body as { transformToWebStream: unknown }).transformToWebStream === "function"
  ) {
    return (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  }
  throw new Error("R2 get: response body is not a streamable object");
}

/**
 * An `ObjectStore` over R2. The S3 client is created lazily on first use (so an import on a
 * creds-less machine is inert) and memoized for the instance. Use a single instance per process.
 */
export class R2ObjectStore implements ObjectStore {
  private client: S3Client | null = null;
  private bucket: string | null = null;

  private resolveClient(): { client: S3Client; bucket: string } {
    if (this.client && this.bucket) return { client: this.client, bucket: this.bucket };
    const config = readR2Config();
    // R2's S3 API uses region "auto"; the endpoint carries the account. forcePathStyle keeps keys
    // with slashes addressable without virtual-host bucket DNS.
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    return { client: this.client, bucket: this.bucket };
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult> {
    const { client, bucket } = this.resolveClient();
    // Copy into a Buffer so ContentLength is exact and the SDK doesn't try to stream a view.
    const body = Buffer.from(bytes);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );
    return { key, byteSize: body.byteLength };
  }

  async get(key: string): Promise<ObjectRead | null> {
    const { client, bucket } = this.resolveClient();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) return null;
      return {
        stream: bodyToWebStream(result.Body),
        contentType: result.ContentType ?? "application/octet-stream",
        byteSize: typeof result.ContentLength === "number" ? result.ContentLength : 0,
      };
    } catch (err) {
      // A missing object is a NoSuchKey / 404 -> null (not an error). Anything else re-throws.
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}

/** Whether an S3 SDK error is a "key not found" (NoSuchKey, or a 404 status). */
function isNotFound(err: unknown): boolean {
  if (err !== null && typeof err === "object") {
    const name = (err as { name?: unknown }).name;
    if (name === "NoSuchKey" || name === "NotFound") return true;
    const status = (err as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode;
    if (status === 404) return true;
  }
  return false;
}
