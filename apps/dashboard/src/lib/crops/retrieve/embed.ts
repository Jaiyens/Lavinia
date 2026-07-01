// Crop report retrieval — the embedding boundary (Phase 7, Track E). Grower documents are the
// grower's commercial secret, so EVERY embedding here goes through a ZERO-DATA-RETENTION path, NEVER
// the Vercel AI Gateway — exactly the rule the extraction reader follows. Capability-gated: unless a
// ZDR embedding endpoint is wired, NO live call is made (callers fall back to the "retrieval
// unavailable" tool result). The PURE `rerank` ranking is exported separately so it is the
// fully-built, tested core — zero external calls, zero infra.
//
// SCAFFOLD STATUS (intentional, per the track's infra/credential gate): the ZDR boundary
// (`@/lib/ai/zdr`) is Anthropic-direct, and Anthropic offers NO embedding model — and no other
// embedding provider is in this app's dependencies. So the LIVE embedding endpoint is not wired here:
// `embedChunks` / `embedQuery` are gated by `canEmbed()` (which is false until a zero-retention
// embedding provider is configured and injected), and the model constructor is a documented stub that
// throws if ever reached. Wiring it later means: install a ZDR-capable embedding provider, set its
// key, flip `canEmbed()`, and return a real EmbeddingModel from `createZdrEmbeddingModel`. Until then
// retrieval honestly reports "unavailable". Embedding width is pinned to RawReportChunk vector(1536).

import { embed, embedMany, type EmbeddingModel } from "ai";
import { hasZdrKey } from "@/lib/ai/zdr";

/** The embedding model id and its dimensionality (must equal the vector(1536) column width). */
export const EMBED_MODEL = process.env.ZDR_EMBED_MODEL ?? "text-embedding-3-small";
export const EMBED_DIMENSIONS = 1536;

/** Whether a zero-retention embedding provider is wired in this deployment. */
function hasZdrEmbedProvider(): boolean {
  // No ZDR-capable embedding provider is installed yet (see the SCAFFOLD note). Even with a ZDR key
  // present, embeddings stay gated off until one is wired, so retrieval reports "unavailable" rather
  // than risk routing grower text through a non-zero-retention provider. Flip this when wiring.
  return false;
}

/**
 * Whether grower embeddings can be produced live. Requires BOTH the ZDR key AND a wired
 * zero-retention embedding provider. Missing either -> the retrieval tool degrades to "unavailable"
 * and we make zero external calls. Reads env only; never constructs a client or logs a secret.
 */
export function canEmbed(): boolean {
  return hasZdrKey() && hasZdrEmbedProvider();
}

/**
 * Construct the ZERO-DATA-RETENTION embedding model. STUB until a zero-retention embedding provider is
 * wired (see the SCAFFOLD note): never reached, because `canEmbed()` gates every caller. When wired,
 * return the real provider's embedding model here — never the Vercel AI Gateway.
 */
function createZdrEmbeddingModel(): EmbeddingModel {
  throw new Error(
    "No ZDR embedding provider wired: configure a zero-retention embedding endpoint before embedding",
  );
}

/** One chunk of a grower document staged for embedding at ingest. */
export type ChunkInput = {
  id: string;
  content: string;
};

/** A chunk paired with its embedding vector, ready to write to RawReportChunk.embedding. */
export type EmbeddedChunk = {
  id: string;
  embedding: number[];
};

/**
 * Embed many chunks at ingest via the ZDR path. Capability-gated: with no key this returns an empty
 * array WITHOUT a live call, so an ingest with no ZDR configured simply stages chunks un-embedded
 * (the retrieval tool then reports "unavailable"). The ONLY door grower chunks may use to be
 * embedded.
 */
export async function embedChunks(chunks: readonly ChunkInput[]): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0 || !canEmbed()) return [];
  const { embeddings } = await embedMany({
    model: createZdrEmbeddingModel(),
    values: chunks.map((chunk) => chunk.content),
  });
  return chunks.map((chunk, index) => {
    const embedding = embeddings[index];
    if (embedding === undefined) {
      throw new Error(`embedMany returned no vector for chunk at index ${index}`);
    }
    return { id: chunk.id, embedding };
  });
}

/**
 * Embed a single query string via the ZDR path. Capability-gated: returns null WITHOUT a live call
 * when no key is configured (the caller then reports retrieval unavailable).
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (!canEmbed()) return null;
  const { embedding } = await embed({ model: createZdrEmbeddingModel(), value: query });
  return embedding;
}

// --- Pure ranking ---------------------------------------------------------------------------------
// rerank is a PURE function: cosine similarity of a query vector against candidate vectors, returning
// the candidates sorted best-first with their scores. It does no IO and no embedding — the database's
// hnsw index does the coarse nearest-neighbour search; this is the deterministic, testable re-rank
// over whatever candidate set is handed in (and the path used in dev where there is no live DB
// vector search). Same input => same output.

/** A candidate to be re-ranked: an opaque id plus its embedding vector. */
export type RerankCandidate = {
  id: string;
  embedding: readonly number[];
};

/** A re-ranked candidate: its id and the cosine similarity score it earned against the query. */
export type RankedCandidate = {
  id: string;
  score: number;
};

/** Dot product of two equal-length vectors. */
function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

/** Euclidean norm of a vector. */
function norm(a: readonly number[]): number {
  return Math.sqrt(dot(a, a));
}

/**
 * Cosine similarity in [-1, 1]. A zero vector (no magnitude) has no direction, so similarity is 0 —
 * never NaN. Pure.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const denom = norm(a) * norm(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}

/**
 * Re-rank candidates against a query embedding by cosine similarity, best-first. A candidate whose
 * embedding length does not match the query is skipped (it cannot be compared honestly — never
 * coerced into a misleading score). Ties break by id so the order is deterministic. Pure: no IO, no
 * clock, no randomness. `topK` (default all) caps the returned set.
 */
export function rerank(
  queryEmbedding: readonly number[],
  candidates: readonly RerankCandidate[],
  topK = candidates.length,
): RankedCandidate[] {
  const scored: RankedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.embedding.length !== queryEmbedding.length) continue;
    scored.push({ id: candidate.id, score: cosineSimilarity(queryEmbedding, candidate.embedding) });
  }
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return scored.slice(0, Math.max(0, topK));
}
