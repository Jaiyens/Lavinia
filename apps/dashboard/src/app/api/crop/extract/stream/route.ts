// The live grower-extraction view: streams the rows as Claude fills them in, over the DIRECT
// Anthropic ZERO-DATA-RETENTION endpoint (Crops rule 6). FAIL-CLOSED: if no ZDR key is configured we
// return 503 and NEVER call out — grower data is never sent without a zero-retention path. This route
// constructs the model via `@/lib/ai/zdr` only; it never touches `@/lib/ai/gateway`.
//
// Streaming yields a live-filling object the client renders, but the pound numbers it shows are NOT
// certified here — reconciliation is the deterministic gate's job (server-side, post-stream). The UI
// renders rows + a coverage badge; it does no pound arithmetic.

import { streamObject } from "ai";
import { createZdrModel, hasZdrKey } from "@/lib/ai/zdr";
import { PoundExtractionSchema } from "@/lib/crops/extract/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const EXTRACT_PROMPT =
  "You are reading ONE packer settlement statement for an almond grower. Extract two things " +
  "SEPARATELY: (1) `rows`: every printed variety weight line as { variety, pounds } in whole " +
  "integer pounds; (2) `controlTotalPounds`: the statement's PRINTED grand total in whole pounds, " +
  "read from the document's own total line — DO NOT sum the rows yourself; null if no grand total " +
  "is printed. Also return `confidence` (0..1). Never invent a total to make the rows add up.";

type StreamRequestBody = { page?: unknown };

function parseBody(value: unknown): StreamRequestBody {
  return typeof value === "object" && value !== null ? (value as StreamRequestBody) : {};
}

export async function POST(req: Request): Promise<Response> {
  // Fail closed: no zero-retention key -> never reach out with grower data.
  if (!hasZdrKey()) {
    return Response.json({ error: "zdr_unavailable" }, { status: 503 });
  }

  const body = parseBody(await req.json().catch(() => ({})));
  const page = typeof body.page === "string" ? body.page : "";
  if (page.length === 0) {
    return Response.json({ error: "missing_page" }, { status: 400 });
  }

  const result = streamObject({
    model: createZdrModel("claude-sonnet-4-6"),
    schema: PoundExtractionSchema,
    schemaName: "PoundExtraction",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACT_PROMPT },
          { type: "text", text: page },
        ],
      },
    ],
  });

  return result.toTextStreamResponse();
}
