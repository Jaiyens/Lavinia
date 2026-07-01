import { describe, expect, it } from "vitest";
import { MemoryObjectStore } from "./object-store";

/** Drain a web ReadableStream<Uint8Array> into a single Uint8Array. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

describe("MemoryObjectStore", () => {
  it("round-trips bytes and content type on put then get", async () => {
    const store = new MemoryObjectStore();
    const bytes = new TextEncoder().encode("<html>raw page</html>");
    const key = "crop/farm1/entity1/2024/abc123.html";

    const put = await store.put(key, bytes, "text/html");
    expect(put).toEqual({ key, byteSize: bytes.byteLength });

    const read = await store.get(key);
    expect(read).not.toBeNull();
    expect(read?.contentType).toBe("text/html");
    expect(read?.byteSize).toBe(bytes.byteLength);
    const roundTripped = await drain(read!.stream);
    expect(roundTripped).toEqual(bytes);
    expect(new TextDecoder().decode(roundTripped)).toBe("<html>raw page</html>");
  });

  it("returns null for a missing key", async () => {
    const store = new MemoryObjectStore();
    expect(await store.get("crop/nope/missing.html")).toBeNull();
  });

  it("stores an independent copy (later mutation of the source buffer does not change stored bytes)", async () => {
    const store = new MemoryObjectStore();
    const bytes = new Uint8Array([1, 2, 3]);
    await store.put("k", bytes, "application/octet-stream");
    bytes[0] = 99; // mutate the caller's buffer after storing

    const read = await store.get("k");
    const out = await drain(read!.stream);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});
