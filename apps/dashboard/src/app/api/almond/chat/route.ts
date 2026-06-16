import type { UIMessage } from "ai";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { buildSystemPrompt } from "@/lib/almond/persona";
import { defaultAlmondResponder } from "@/lib/almond/responder";

/**
 * Almond's chat endpoint (Story 6.1). Owner-scoped: the farm is resolved ONCE here (from the
 * session via `dashboardFarm`, or the badged demo for the public Tour), and the tools are built
 * closed over that farmId, so the model can never read another grower's data — no farmId ever
 * comes from the client. The model boundary is injected (`defaultAlmondResponder`): the offline
 * stub in dev/CI (zero external calls), the live Gateway only when a key is present. Read-only;
 * nothing here mutates.
 *
 * COST/ABUSE NOTE: the Tour fallback makes this a PUBLIC, unauthenticated AI endpoint scoped to
 * the demo farm. It only ever reads demo data (no grower data can leak), but with a live Gateway
 * key each request costs money, so a scripted caller could run up spend. Add rate-limiting / bot
 * protection (e.g. Vercel BotID or a per-IP limit) before exposing the Tour widely.
 */
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const userId = await sessionUserId();
  // Signed-in: their own farm. Public Tour (no session): the demo farm, read-only — Almond is
  // part of the full tour now, never a leak (demoFarm is isDemo-only, never real data).
  const resolved = userId ? await dashboardFarm(prisma, userId) : await demoFarm(prisma);
  if (!resolved) {
    return Response.json({ error: "no farm" }, { status: 400 });
  }

  let uiMessages: UIMessage[];
  try {
    const body: unknown = await req.json();
    const messages =
      body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }
    uiMessages = messages as UIMessage[];
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const farm = resolved.farm;
  // Never present a nameless farm: fall back if the name is blank/whitespace.
  const farmName = farm.name.trim() || "your farm";
  const responder = defaultAlmondResponder();
  try {
    return await responder.toResponse({
      uiMessages,
      system: buildSystemPrompt(farmName),
      deps: { prisma, farmId: farm.id, farmName },
    });
  } catch {
    // Construction/conversion errors (e.g. a malformed message reaching the live model) become a
    // clean 500 the client renders as the inline error state, never an unhandled crash.
    return Response.json({ error: "almond failed" }, { status: 500 });
  }
}
