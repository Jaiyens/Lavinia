// Track E pure ranking test: rerank must be a deterministic cosine-similarity ranking — no IO, no
// embedding, no live call. This is the testable core of the retrieval path (the DB's hnsw index does
// the coarse search; rerank is the deterministic re-rank over candidates, and the dev path with no
// live vector search).

import { describe, expect, it } from "vitest";
import { cosineSimilarity, rerank } from "./embed";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("treats a zero vector as similarity 0 (never NaN)", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("rerank", () => {
  const query = [1, 0, 0];
  const candidates = [
    { id: "orthogonal", embedding: [0, 1, 0] },
    { id: "aligned", embedding: [1, 0, 0] },
    { id: "near", embedding: [0.9, 0.1, 0] },
    { id: "opposite", embedding: [-1, 0, 0] },
  ];

  it("ranks candidates best-first by cosine similarity", () => {
    const ranked = rerank(query, candidates);
    expect(ranked.map((r) => r.id)).toEqual(["aligned", "near", "orthogonal", "opposite"]);
    expect(ranked[0]?.score).toBeCloseTo(1, 10);
    expect(ranked[3]?.score).toBeCloseTo(-1, 10);
  });

  it("caps the result at topK", () => {
    expect(rerank(query, candidates, 2).map((r) => r.id)).toEqual(["aligned", "near"]);
  });

  it("skips candidates whose embedding width does not match the query", () => {
    const mixed = [
      { id: "good", embedding: [1, 0, 0] },
      { id: "wrong-width", embedding: [1, 0] },
    ];
    expect(rerank(query, mixed).map((r) => r.id)).toEqual(["good"]);
  });

  it("is deterministic: ties break by id, same input same output", () => {
    const tied = [
      { id: "b", embedding: [1, 0, 0] },
      { id: "a", embedding: [1, 0, 0] },
    ];
    expect(rerank(query, tied).map((r) => r.id)).toEqual(["a", "b"]);
    expect(rerank(query, candidates)).toEqual(rerank(query, candidates));
  });

  it("returns an empty array for no candidates", () => {
    expect(rerank(query, [])).toEqual([]);
  });
});
