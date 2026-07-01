// The Almond CROP responder route (Phase 7, Track E). PARALLEL to /api/almond/chat (the bash
// document agent) — this is the read-only, streamText crop surface whose every number flows from a
// deterministic tool result. Fail-closed: no session/farm -> error before any model call; no gateway
// key -> 503 (dev/CI make zero external calls). The farmId is resolved SERVER-SIDE and pinned into
// the tool deps, never taken from the request body, so the model can never widen scope.

import { type UIMessage } from "ai";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import { prisma } from "@/lib/db";
import { hasGatewayKey } from "@/lib/ai/gateway";
import { currentFarm, demoFarm } from "@/lib/onboarding/farm";
import { checkChatRateLimit, clientIp } from "@/lib/almond/rate-limit";
import { resolveAlmondModel } from "@/lib/almond/models";
import { runCropResponder } from "@/lib/almond/responder";
import { loadCropLedger } from "@/lib/crops/load";
import { createReportSearch } from "@/lib/crops/retrieve/search";

export const runtime = "nodejs";
export const maxDuration = 120;

type CropRequestBody = {
  messages?: unknown;
  model?: unknown;
};

function parseBody(value: unknown): CropRequestBody {
  return typeof value === "object" && value !== null ? (value as CropRequestBody) : {};
}

export async function POST(req: Request): Promise<Response> {
  const rateLimit = checkChatRateLimit(clientIp(req.headers));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  // Live model gate: with no gateway key, dev/CI make zero external calls.
  if (!hasGatewayKey()) {
    return Response.json({ error: "responder_unavailable" }, { status: 503 });
  }

  const body = parseBody(await req.json().catch(() => ({})));
  const messages = (Array.isArray(body.messages) ? body.messages : []) as UIMessage[];
  const modelId = resolveAlmondModel(body.model);

  // Resolve the farm server-side, exactly as /api/almond/chat does. NEVER from the body.
  const userId = await sessionUserId();
  const farm =
    userId === null
      ? (await demoFarm(prisma))?.farm
      : await currentFarm(prisma, userId, await activeFarmId(userId));

  if (!farm) {
    return Response.json({ error: "farm_not_found" }, { status: 404 });
  }

  try {
    const result = await runCropResponder({
      deps: {
        farmId: farm.id,
        loadLedger: (farmId) => loadCropLedger(prisma, farmId),
        search: createReportSearch(prisma),
      },
      modelId,
      messages,
      abortSignal: req.signal,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[almond] crop responder failed", err);
    return Response.json({ error: "responder_failed" }, { status: 500 });
  }
}
