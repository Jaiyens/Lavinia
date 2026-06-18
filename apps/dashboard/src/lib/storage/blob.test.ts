import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline unit test for the private-blob storage seam (Story 8.6). `@vercel/blob` is MOCKED, so
// there are ZERO external calls: we assert the wrapper passes the PRIVATE-blob options the law
// requires (access "private", no random suffix, no overwrite) and reads bytes back by pathname.

const put = vi.fn();
const get = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => put(...args),
  get: (...args: unknown[]) => get(...args),
}));

import {
  getPrivateBlob,
  newReportBlobKey,
  putPrivateBlob,
  XLSX_CONTENT_TYPE,
} from "./blob";

beforeEach(() => {
  put.mockReset();
  get.mockReset();
});

describe("newReportBlobKey", () => {
  it("produces a reports/-prefixed, .xlsx-suffixed, non-guessable key", () => {
    const key = newReportBlobKey();
    expect(key.startsWith("reports/")).toBe(true);
    expect(key.endsWith(".xlsx")).toBe(true);
  });

  it("is unique every call (non-guessable)", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newReportBlobKey()));
    expect(keys.size).toBe(200);
  });

  it("honors a custom extension", () => {
    expect(newReportBlobKey("csv").endsWith(".csv")).toBe(true);
  });
});

describe("putPrivateBlob", () => {
  it("writes PRIVATE, no random suffix, no overwrite, and records the exact pathname + size", async () => {
    put.mockResolvedValueOnce({ url: "https://blob/x", pathname: "reports/a.xlsx" });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const stored = await putPrivateBlob("reports/a.xlsx", bytes);

    expect(put).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = put.mock.calls[0] as [string, Buffer, Record<string, unknown>];
    expect(pathname).toBe("reports/a.xlsx");
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.byteLength).toBe(5);
    // The PRIVATE-blob laws: never public, never a random suffix (the cuid/uuid key is already
    // unique so the recorded pathname is the exact read-back key), never an in-place overwrite.
    expect(options.access).toBe("private");
    expect(options.addRandomSuffix).toBe(false);
    expect(options.allowOverwrite).toBe(false);
    expect(options.contentType).toBe(XLSX_CONTENT_TYPE);

    // The returned size is the bytes we wrote, not anything the SDK echoed.
    expect(stored).toEqual({ pathname: "reports/a.xlsx", byteSize: 5 });
  });

  it("never surfaces a public URL (a private blob is read back by pathname, never a handed-out URL)", async () => {
    put.mockResolvedValueOnce({ url: "https://blob/secret", pathname: "reports/b.xlsx" });
    const stored = await putPrivateBlob("reports/b.xlsx", new Uint8Array([9]));
    expect(JSON.stringify(stored)).not.toContain("http");
    expect(stored).not.toHaveProperty("url");
  });
});

describe("getPrivateBlob", () => {
  it("requests the blob PRIVATELY and returns the stream + content type + size on a 200", async () => {
    const stream = new ReadableStream<Uint8Array>();
    get.mockResolvedValueOnce({
      statusCode: 200,
      stream,
      headers: new Headers(),
      blob: { contentType: XLSX_CONTENT_TYPE, size: 42 },
    });

    const result = await getPrivateBlob("reports/a.xlsx");
    expect(get).toHaveBeenCalledWith("reports/a.xlsx", { access: "private", useCache: false });
    expect(result).not.toBeNull();
    expect(result?.stream).toBe(stream);
    expect(result?.contentType).toBe(XLSX_CONTENT_TYPE);
    expect(result?.byteSize).toBe(42);
  });

  it("returns null when the blob does not exist (the route turns it into a 404)", async () => {
    get.mockResolvedValueOnce(null);
    expect(await getPrivateBlob("reports/missing.xlsx")).toBeNull();
  });

  it("returns null on a 304 (no body), never an unstreamable result", async () => {
    get.mockResolvedValueOnce({
      statusCode: 304,
      stream: null,
      headers: new Headers(),
      blob: { contentType: null, size: null },
    });
    expect(await getPrivateBlob("reports/cached.xlsx")).toBeNull();
  });
});
