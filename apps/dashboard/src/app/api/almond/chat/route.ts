import { createAgentUIStreamResponse, smoothStream } from "ai";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import { prisma } from "@/lib/db";
import { hasGatewayKey } from "@/lib/ai/gateway";
import { currentFarm, demoFarm } from "@/lib/onboarding/farm";
import { buildFarmFiles } from "@/lib/almond/context";
import { createAlmondAgent } from "@/lib/almond/agent";
import { checkChatRateLimit, clientIp } from "@/lib/almond/rate-limit";
import { resolveAlmondModel } from "@/lib/almond/models";
import {
  createSandbox,
  hasSandboxCredentials,
  stopSandboxOnce,
  withSandboxCleanup,
} from "@/lib/sandbox/client";

export const runtime = "nodejs";
export const maxDuration = 300;

type ChatRequestBody = {
  messages?: unknown;
  model?: unknown;
};

function parseBody(value: unknown): ChatRequestBody {
  return typeof value === "object" && value !== null ? (value as ChatRequestBody) : {};
}

export async function POST(req: Request): Promise<Response> {
  const rateLimit = checkChatRateLimit(clientIp(req.headers));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  if (!hasGatewayKey() || !hasSandboxCredentials()) {
    return Response.json({ error: "agent_unavailable" }, { status: 503 });
  }

  const body = parseBody(await req.json().catch(() => ({})));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const modelId = resolveAlmondModel(body.model);

  const userId = await sessionUserId();
  const farm =
    userId === null
      ? (await demoFarm(prisma))?.farm
      : await currentFarm(prisma, userId, await activeFarmId(userId));

  if (!farm) {
    return Response.json({ error: "farm_not_found" }, { status: 404 });
  }

  const sandbox = await createSandbox();

  try {
    const farmFiles = await buildFarmFiles(prisma, farm.id, farm.name);
    const agent = await createAlmondAgent({
      modelId,
      farmName: farm.name,
      farmFiles,
      sandbox,
    });

    const response = await createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      abortSignal: req.signal,
      timeout: { totalMs: 290_000 },
      sendReasoning: true,
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: "word",
      }),
    });

    return withSandboxCleanup(response, sandbox);
  } catch (err) {
    await stopSandboxOnce(sandbox);
    console.error("[almond] chat failed", err);
    return Response.json({ error: "agent_failed" }, { status: 500 });
  }
}
