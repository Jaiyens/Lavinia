// find-report tool: pgvector retrieval over the grower's embedded crop documents (RawReportChunk),
// scoped to the session farm. This is the capability-/infra-gated surface — with NO ZDR key (so no
// query embedding can be produced) OR no pgvector path, it returns an explicit "retrieval
// unavailable" result and makes ZERO live calls; it never fabricates a citation. When available it
// embeds the query via the ZDR path, runs a farmId-scoped nearest-neighbour search, and returns the
// hits (the model never sees the farmId — it is captured from deps — and never produces a score).

import { tool } from "ai";
import { z } from "zod";
import { canEmbed, embedQuery } from "@/lib/crops/retrieve/embed";
import type { CropToolDeps } from "./deps";
import type { FindReportResult, ReportHit } from "./results";

/** Input the MODEL controls: the natural-language query and an optional crop-year narrowing. */
export const findReportInput = z.object({
  query: z.string().min(1).describe("What to look for in the grower's uploaded crop documents."),
  cropYear: z
    .number()
    .int()
    .optional()
    .describe("Optional crop year to limit the search to documents about that season."),
});
export type FindReportInput = z.infer<typeof findReportInput>;

/** How many chunks the nearest-neighbour search returns. */
export const FIND_REPORT_TOP_K = 5;

/** How a snippet is bounded so a result never dumps a whole document into the model context. */
const SNIPPET_CHARS = 400;

/**
 * The retrieval port the tool depends on. The live wiring (the crop route) runs a farmId-scoped
 * pgvector `<=>` (cosine distance) query through withFarmTenant; tests / dev with no infra inject a
 * stub. Kept separate from the embed module so the tool can be gated and tested without a DB.
 */
export type ReportSearch = {
  /** Nearest chunks for `embedding`, scoped to `farmId` (+ optional cropYear), best-first. */
  search(args: {
    farmId: string;
    embedding: number[];
    cropYear: number | null;
    topK: number;
  }): Promise<ReportHit[]>;
};

/** The find-report tool also needs the retrieval port, on top of the shared crop deps. */
export type FindReportDeps = CropToolDeps & { search: ReportSearch };

function snippet(content: string): string {
  return content.length > SNIPPET_CHARS ? `${content.slice(0, SNIPPET_CHARS)}...` : content;
}

/**
 * Build the AI SDK tool. Fail-closed capability gate: if embeddings cannot be produced (no ZDR key),
 * return "unavailable" without any live call. Otherwise embed the query and run the scoped search;
 * an empty search returns the typed EMPTY result, never a fabricated hit.
 */
export function findReportTool(deps: FindReportDeps) {
  return tool({
    description:
      "Search the grower's uploaded crop documents (packer statements, pool true-ups) for passages " +
      "relevant to a question, and return short snippets with their source. Use this to ground an " +
      "answer in the grower's own paperwork. Returns nothing if no documents match.",
    inputSchema: findReportInput,
    execute: async (input: FindReportInput): Promise<FindReportResult> => {
      if (!canEmbed()) {
        return {
          kind: "unavailable",
          reason: "Document search is not configured for this farm yet.",
        };
      }
      const embedding = await embedQuery(input.query);
      if (embedding === null) {
        return {
          kind: "unavailable",
          reason: "Document search is not configured for this farm yet.",
        };
      }
      const hits = await deps.search.search({
        farmId: deps.farmId,
        embedding,
        cropYear: input.cropYear ?? null,
        topK: FIND_REPORT_TOP_K,
      });
      if (hits.length === 0) {
        return { kind: "empty", reason: "No matching crop documents found for this farm." };
      }
      return {
        kind: "reports",
        query: input.query,
        hits: hits.map((hit) => ({ ...hit, snippet: snippet(hit.snippet) })),
      };
    },
  });
}
