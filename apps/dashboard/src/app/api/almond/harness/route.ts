import type { UIMessage } from "ai";
import { createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { checkChatRateLimit, clientIp } from "@/lib/almond/rate-limit";
import { checkUsageBudget } from "@/lib/almond/usage-budget";
import { buildAlmondSandboxContext } from "@/lib/almond/harness/context";
import {
  createAlmondHarnessAgent,
  resolveAlmondHarnessRuntime,
} from "@/lib/almond/harness/agent";
import {
  loadHarnessSessionState,
  saveHarnessSessionState,
} from "@/lib/almond/harness/session-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_HARNESS_MODEL = {
  "claude-code": "anthropic/claude-opus-4.8",
  codex: "openai/gpt-5.5",
} as const;

type HarnessBody = {
  id?: unknown;
  messages?: unknown;
  runtime?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  const limit = checkChatRateLimit(clientIp(req.headers));
  if (!limit.allowed) {
    return Response.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const userId = await sessionUserId();
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });

  const budget = await checkUsageBudget(prisma, userId);
  if (!budget.allowed) {
    return Response.json(
      { error: "usage_limit", window: budget.window, resetAt: budget.resetAt },
      { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } },
    );
  }

  let body: HarnessBody;
  try {
    body = (await req.json()) as HarnessBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const chatId = typeof body.id === "string" && body.id.trim() ? body.id : null;
  if (!chatId) return Response.json({ error: "chat id required" }, { status: 400 });
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (!resolved) return Response.json({ error: "no farm" }, { status: 400 });

  const uiMessages = body.messages as UIMessage[];
  const farm = resolved.farm;
  const farmName = farm.name.trim() || "your farm";
  const harnessRuntime = resolveAlmondHarnessRuntime(body.runtime);
  const modelId = DEFAULT_HARNESS_MODEL[harnessRuntime];
  const context = await buildAlmondSandboxContext({
    prisma,
    userId,
    farmId: farm.id,
    farmName,
    uiMessages,
  });
  const agent = createAlmondHarnessAgent({ context, runtime: harnessRuntime, modelId });
  const resumeFrom = await loadHarnessSessionState({
    chatId,
    harnessId: agent.harnessId,
  });
  const session = await agent.createSession(
    resumeFrom ? { sessionId: chatId, resumeFrom } : { sessionId: chatId },
  );

  try {
    const result = await agent.stream({
      session,
      prompt: lastUserTextFor(uiMessages),
      abortSignal: req.signal,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onEnd: async () => {
          const resumeState = await session.detach();
          await saveHarnessSessionState({
            chatId,
            harnessId: agent.harnessId,
            resumeState,
          });
        },
      }),
    });
  } catch (error) {
    await session.destroy().catch(() => undefined);
    throw error;
  }
}

function lastUserTextFor(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = (lastUser?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
  return text || "Inspect the packaged Terra context and answer the user's latest request.";
}
