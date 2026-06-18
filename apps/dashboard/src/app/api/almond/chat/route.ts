import type { UIMessage } from "ai";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { buildSystemPrompt } from "@/lib/almond/persona";
import { defaultAlmondResponder } from "@/lib/almond/responder";
import { checkChatRateLimit, clientIp } from "@/lib/almond/rate-limit";

/**
 * Almond's chat endpoint (Story 6.1). Owner-scoped: the farm is resolved ONCE here (from the
 * session via `dashboardFarm`, or the badged demo for the public Tour), and the tools are built
 * closed over that farmId, so the model can never read another grower's data — no farmId ever
 * comes from the client. The model boundary is injected (`defaultAlmondResponder`): the offline
 * stub in dev/CI (zero external calls), the live Gateway only when a key is present.
 *
 * COST/ABUSE PROTECTION (Story 10.3, AR16 / ADR-A08): the Tour fallback makes this a PUBLIC,
 * unauthenticated AI endpoint scoped to the demo farm. It only ever reads demo data (no grower data
 * can leak), but Epics 8/9 made it GENERATIVE too — with a live Gateway key each request costs model
 * spend, and for an authed owner the export/PDF skills WRITE a Blob object + a DB row. Two guards are
 * now in place:
 *   1. a per-IP fixed-window rate limit checked FIRST here (a scripted caller gets a cheap 429 +
 *      Retry-After before any farm read or model call), and
 *   2. a per-farm generation throttle on the owner-only export/report skills (src/lib/almond/tools.ts)
 *      that bounds heavy-artifact (Blob/DB) volume per farm.
 * Both live in `src/lib/almond/rate-limit.ts` (in-memory, dependency-free). Before the public Tour is
 * widened, ALSO enable Vercel BotID in the Vercel dashboard as the platform/edge layer (the in-memory
 * limiter is per-instance; BotID is the durable cross-instance companion).
 */
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  // Per-IP rate limit FIRST (Story 10.3): a blocked request must cost no DB read and no Gateway spend,
  // so this short-circuits before the farm is resolved or the body is parsed. 429 + Retry-After lets a
  // well-behaved client back off; a scripted flood is cut cheaply.
  const limit = checkChatRateLimit(clientIp(req.headers));
  if (!limit.allowed) {
    return Response.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

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
  // Capability is a SERVER property, never from the request body (ADR-A08): an authed owner is
  // a signed-in grower on their OWN connected farm (dataKind "real"); the public Tour resolves
  // the badged demo farm ("representative") and is NOT an owner. The factory uses this to gate
  // which skills the model is handed — today nothing is gated, but the flag is wired end to end.
  const authedOwner = resolved.dataKind === "real";
  const responder = defaultAlmondResponder();
  try {
    return await responder.toResponse({
      uiMessages,
      system: buildSystemPrompt(farmName),
      deps: { prisma, farmId: farm.id, farmName },
      // userId rides on the actor so an owner-only side effect (persisting an export to Reports,
      // Story 8.6) can record who asked. Only ever the owner's own id; null for the public Tour.
      actor: { authedOwner, userId: authedOwner ? userId : null },
    });
  } catch {
    // Construction/conversion errors (e.g. a malformed message reaching the live model) become a
    // clean 500 the client renders as the inline error state, never an unhandled crash.
    return Response.json({ error: "almond failed" }, { status: 500 });
  }
}
