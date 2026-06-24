import { createAgentUIStreamResponse } from "ai";
import { Sandbox } from "@vercel/sandbox";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import { prisma } from "@/lib/db";
import { hasGatewayKey } from "@/lib/ai/gateway";
import { currentFarm, demoFarm } from "@/lib/onboarding/farm";
import { buildFarmFiles } from "@/lib/almond/context";
import { createAlmondAgent } from "@/lib/almond/agent";
import { checkChatRateLimit, clientIp } from "@/lib/almond/rate-limit";
import { resolveAlmondModel } from "@/lib/almond/models";

export const runtime = "nodejs";
export const maxDuration = 300;

type ChatRequestBody = {
  messages?: unknown;
  model?: unknown;
};

type SandboxCredentials = { token: string; teamId: string; projectId: string } | Record<string, never>;

function sandboxCredentials(): SandboxCredentials {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

function hasSandboxCredentials(): boolean {
  if (process.env.VERCEL && process.env.VERCEL_OIDC_TOKEN) return true;
  return "token" in sandboxCredentials();
}

function parseBody(value: unknown): ChatRequestBody {
  return typeof value === "object" && value !== null ? (value as ChatRequestBody) : {};
}

async function stopSandboxOnce(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.stop();
  } catch (err) {
    console.error("[almond] failed to stop sandbox", err);
  }
}

function withSandboxCleanup(response: Response, sandbox: Sandbox): Response {
  if (!response.body) {
    void stopSandboxOnce(sandbox);
    return response;
  }

  const reader = response.body.getReader();
  let stopped = false;
  const cleanup = async () => {
    if (stopped) return;
    stopped = true;
    await stopSandboxOnce(sandbox);
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await cleanup();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        await cleanup();
        controller.error(err);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await cleanup();
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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

  const snapshotId = process.env.DOC_EXPORT_SNAPSHOT_ID;
  const sandbox = await Sandbox.create({
    ...sandboxCredentials(),
    ...(snapshotId
      ? { source: { type: "snapshot" as const, snapshotId } }
      : { runtime: "node24" as const }),
    timeout: 5 * 60 * 1000,
  });

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
    });

    return withSandboxCleanup(response, sandbox);
  } catch (err) {
    await stopSandboxOnce(sandbox);
    console.error("[almond] chat failed", err);
    return Response.json({ error: "agent_failed" }, { status: 500 });
  }
}
