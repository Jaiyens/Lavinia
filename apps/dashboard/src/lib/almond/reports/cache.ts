import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrivateBlob } from "@/lib/storage/blob";
import type { GeneratedReportKind } from "./store";

/**
 * The content-addressed report cache (Phase 2 of the Almond hybrid export engine). The user's law:
 * an identical ask on UNCHANGED farm data returns the previously generated file instantly; any real
 * change (the data OR the request) regenerates a fresh file. We get that with a single key:
 *
 *   cacheKey = sha256(farmId | farmDataFingerprint | engineVersion | skill | normalizedRequest)
 *
 * - `farmDataFingerprint` is a CHEAP rollup (counts + freshest timestamps + the billed-dollar sum)
 *   over the tables that feed an export, so ANY add/remove/edit of a meter, a bill, or a finding
 *   moves it - and therefore the key - with no full data load. This is how "real change -> fresh
 *   build" falls out, with no explicit invalidation.
 * - `engineVersion` is bumped whenever a renderer's OUTPUT changes, so a code upgrade invalidates
 *   every cached file without needing a data change.
 * - `normalizedRequest` is the resolved SHAPE (canonical JSON), so two identical asks share a key
 *   and a different ask does not.
 *
 * The cache lives ON `GeneratedReport` (the existing owner-only Reports store): a fresh build is
 * persisted with its `cacheKey`, and a later identical ask finds that row and streams its bytes back
 * from private Blob. The public Tour never persists, so it has no cache to read (it always builds
 * fresh) - exactly the v1 policy. Read-only here; the write is `storeReport` (./store.ts).
 */

/**
 * The renderer/output version. BUMP THIS whenever a change to the workbook/report builders changes
 * the bytes they produce for the same inputs, so every previously cached file is invalidated and
 * rebuilt on next ask (a stale-bytes guard that needs no data change and no manual cache purge).
 */
export const EXPORT_ENGINE_VERSION = "1";

/** Which builder produced the file, mixed into the key so two skills can never collide on one key. */
export type CacheSkill = "export" | "report" | "codegen";

/** sha256 hex of a string. The cache key + the fingerprint are both opaque hex digests. */
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * A cheap fingerprint of the farm data that feeds an export, with NO full load: per-table row counts,
 * the freshest change timestamp, and the summed billed dollars (so a re-import that EDITS a bill
 * value - same row count, same created date - still moves the fingerprint). Any meter/bill/finding
 * add, remove, or edit changes at least one term, so the cache key changes and the file rebuilds.
 */
export async function computeFarmDataFingerprint(
  prisma: PrismaClient,
  farmId: string,
): Promise<string> {
  const [pump, period, rec] = await Promise.all([
    prisma.pump.aggregate({ where: { farmId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.billingPeriod.aggregate({
      where: { pump: { farmId } },
      _count: { _all: true },
      _max: { createdAt: true },
      _sum: { printedTotalCents: true },
    }),
    prisma.recommendation.aggregate({
      where: { farmId },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);

  const parts = [
    pump._count._all,
    pump._max.updatedAt?.toISOString() ?? "0",
    period._count._all,
    period._max.createdAt?.toISOString() ?? "0",
    period._sum.printedTotalCents ?? 0,
    rec._count._all,
    rec._max.createdAt?.toISOString() ?? "0",
  ];
  return sha256(parts.join("|"));
}

/** Canonicalize a request shape to stable JSON (sorted keys), so two equal requests hash the same
 *  regardless of key order. The value is the resolved SHAPE params - never a farmId or a figure. */
function canonicalRequest(request: unknown): string {
  return JSON.stringify(request, (_key, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}

/** Compose the content-addressed cache key from the farm scope, the data fingerprint, the engine
 *  version, the skill, and the normalized request. Pure. */
export function computeCacheKey(args: {
  farmId: string;
  fingerprint: string;
  skill: CacheSkill;
  request: unknown;
}): string {
  return sha256(
    [args.farmId, args.fingerprint, EXPORT_ENGINE_VERSION, args.skill, canonicalRequest(args.request)].join("|"),
  );
}

/** A cache HIT: the stored file's bytes plus the metadata a skill result + download card need. The
 *  bytes come from private Blob; everything else from the persisted row. */
export type CachedFile = {
  cacheKey: string;
  kind: GeneratedReportKind;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  meterCount: number;
  coverageAsOf: string | null;
  params: Prisma.JsonValue;
};

/** Read a ReadableStream of bytes fully into one Uint8Array (the Blob read returns a stream). */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** How long a cached file may serve before we rebuild (a soft bound; the fingerprint is the real
 *  invalidation). 30 days, so a long-GC'd blob is not returned as a phantom hit. */
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Look up a cached file for a (farm, cacheKey). Returns the freshest matching row's bytes + metadata,
 * or null when there is no hit, the row is older than the soft age bound, or its blob is gone (each
 * falls through to a fresh build). FARM-SCOPED at the query so a key can never resolve across the
 * tenant boundary. `now` is injectable so a test can pin the age check.
 */
export async function lookupCachedReport(
  prisma: PrismaClient,
  farmId: string,
  cacheKey: string,
  now: number = Date.now(),
): Promise<CachedFile | null> {
  const row = await prisma.generatedReport.findFirst({
    where: { farmId, cacheKey },
    orderBy: { createdAt: "desc" },
    select: {
      kind: true,
      title: true,
      blobPathname: true,
      coverageAsOf: true,
      paramsJson: true,
      meterCount: true,
      createdAt: true,
    },
  });
  if (row === null) return null;
  if (now - row.createdAt.getTime() > MAX_CACHE_AGE_MS) return null;

  const blob = await getPrivateBlob(row.blobPathname);
  if (blob === null) return null; // bytes GC'd / missing: rebuild fresh

  return {
    cacheKey,
    kind: row.kind as GeneratedReportKind,
    fileName: row.title,
    contentType: blob.contentType,
    bytes: await drainStream(blob.stream),
    meterCount: row.meterCount ?? 0,
    coverageAsOf: row.coverageAsOf,
    params: row.paramsJson,
  };
}
