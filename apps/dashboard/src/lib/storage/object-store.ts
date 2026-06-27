// The object-store seam for RAW scraped pages. Hard rule (this track): raw scraped HTML/PDF bytes
// go to OBJECT STORAGE (R2), NEVER Postgres — Postgres holds only the structured, gated pound data.
// This is a SIBLING of src/lib/storage/blob.ts (private Vercel Blob, used by reports): same "one
// seam" discipline, a different backing store for a different payload class.
//
// The interface is deliberately tiny (put / get) and store-agnostic so the live R2 adapter
// (src/lib/storage/r2.ts) and the in-memory test double below are interchangeable. Steps that write
// raw pages accept an `ObjectStore`, so they are testable end-to-end with zero network.

/** What a write records back: the exact key the bytes live under and their size. */
export type PutResult = {
  key: string;
  byteSize: number;
};

/** A streamed read of stored bytes, or null when the key does not exist. */
export type ObjectRead = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  byteSize: number;
};

/**
 * The minimal raw-page object store. `put` is content-addressed by the caller (the scrape step
 * keys pages by sha), `get` streams them back. Implementations must NOT log payload bytes or any
 * secret. Keys are opaque strings; the scrape step owns the `crop/<farmId>/...` layout.
 */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult>;
  get(key: string): Promise<ObjectRead | null>;
}

/** Turn a Uint8Array into a single-chunk ReadableStream (for the in-memory get + tests). */
function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * An in-memory `ObjectStore` for tests and offline runs (no network, no creds). Stores a copy of
 * the bytes so a later mutation of the caller's buffer can't change what was "stored". `get` of a
 * missing key returns null, exactly like the real adapter.
 */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  put(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult> {
    const copy = bytes.slice();
    this.objects.set(key, { bytes: copy, contentType });
    return Promise.resolve({ key, byteSize: copy.byteLength });
  }

  get(key: string): Promise<ObjectRead | null> {
    const stored = this.objects.get(key);
    if (!stored) return Promise.resolve(null);
    return Promise.resolve({
      stream: bytesToStream(stored.bytes.slice()),
      contentType: stored.contentType,
      byteSize: stored.bytes.byteLength,
    });
  }

  /** Test helper: how many objects are stored. Not part of the ObjectStore contract. */
  size(): number {
    return this.objects.size;
  }
}
