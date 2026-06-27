// The live pgvector nearest-neighbour search (Phase 7, Track E). The DB edge for the find-report
// retrieval tool: a farmId-scoped cosine-distance (`<=>`) query over RawReportChunk.embedding, run
// inside withFarmTenant so RLS is in force (defense-in-depth on top of the explicit `farmId =` in the
// WHERE). pgvector has no Prisma typed surface, so the query is raw SQL ($queryRaw) — the embedding
// is bound as a parameter cast to ::vector. INFRA-GATED: this only runs where the pgvector extension
// and the embedding column exist; with no ZDR key the tool never reaches here (it returns
// "unavailable" before embedding the query).

import { Prisma, type PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import type { ReportHit } from "@/lib/almond/tools/results";
import type { ReportSearch } from "@/lib/almond/tools/find-report";

/** One raw row from the nearest-neighbour query. `distance` is cosine distance (0 = identical). */
type SearchRow = {
  id: string;
  r2Key: string;
  cropYear: number | null;
  content: string;
  distance: number;
};

/**
 * Build the live ReportSearch over a PrismaClient. The embedding is serialized to the pgvector text
 * literal (`[a,b,c]`) and bound as a parameter cast to ::vector — never string-concatenated, so it
 * cannot be SQL-injected. Cosine SIMILARITY is reported as `1 - distance` to match the pure rerank's
 * score convention. The cropYear filter is applied in SQL when present.
 */
export function createReportSearch(prisma: PrismaClient): ReportSearch {
  return {
    search: ({ farmId, embedding, cropYear, topK }) =>
      withFarmTenant(prisma, farmId, async (tx) => {
        const vectorLiteral = `[${embedding.join(",")}]`;
        const yearFilter =
          cropYear === null
            ? Prisma.empty
            : Prisma.sql`AND "cropYear" = ${cropYear}`;
        const rows = await tx.$queryRaw<SearchRow[]>(Prisma.sql`
          SELECT "id", "r2Key", "cropYear", "content",
                 ("embedding" <=> ${vectorLiteral}::vector) AS "distance"
          FROM "RawReportChunk"
          WHERE "farmId" = ${farmId}
            AND "embedding" IS NOT NULL
            ${yearFilter}
          ORDER BY "distance" ASC
          LIMIT ${topK}
        `);
        return rows.map(
          (row): ReportHit => ({
            id: row.id,
            r2Key: row.r2Key,
            cropYear: row.cropYear,
            snippet: row.content,
            score: 1 - row.distance,
          }),
        );
      }),
  };
}
