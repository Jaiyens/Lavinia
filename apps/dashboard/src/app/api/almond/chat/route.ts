import type { UIMessage } from "ai";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { farmRole } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { buildSystemPrompt } from "@/lib/almond/persona";
import { defaultAlmondResponder } from "@/lib/almond/responder";
import { resolveModel } from "@/lib/almond/models";
import { parseSpreadsheetAttachments, stripFileAttachments } from "@/lib/almond/attachments/parse";
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

// The code-gen export POC can run a nested model loop + boot a Vercel Sandbox to render a PDF within a
// single turn (≈20–60s from the pre-built WeasyPrint snapshot — no per-request install). The platform
// default would 504 mid-render, so raise the ceiling. This is a CEILING, not a floor: ordinary
// read-only turns and the deterministic file skills return in well under a second. (Confirm the Vercel
// plan permits 300s; lower it to the plan's max otherwise.)
export const maxDuration = 300;

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
  // Signed-in: a farm they are an active member of, selected by the validated active-farm
  // cookie. Public Tour (no session): the demo farm, read-only — Almond is part of the full tour
  // now, never a leak (demoFarm is isDemo-only, never real data).
  const activeId = await activeFarmId(userId);
  const resolved = userId ? await dashboardFarm(prisma, userId, activeId) : await demoFarm(prisma);
  if (!resolved) {
    return Response.json({ error: "no farm" }, { status: 400 });
  }

  let uiMessages: UIMessage[];
  // The grower's chosen model rides on the body too (Story: model picker). Captured here, validated
  // against the allowlist below — never trusted as-is.
  let requestedModel: unknown;
  try {
    const body: unknown = await req.json();
    const obj =
      body && typeof body === "object" ? (body as { messages?: unknown; model?: unknown }) : {};
    const messages = obj.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }
    uiMessages = messages as UIMessage[];
    requestedModel = obj.model;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const farm = resolved.farm;
  // Never present a nameless farm: fall back if the name is blank/whitespace.
  const farmName = farm.name.trim() || "your farm";
  // Capability is a SERVER property, never from the request body (ADR-A08), and now derived from
  // the caller's ROLE rather than dataKind: an owner or manager may PERSIST (keep an export in
  // Reports) and push attachments; a VIEWER of a real farm — and the public Tour's demo viewer —
  // may not. `canExport` stays broader: every resolved farm (incl. a viewer or the demo) may pull
  // a downloadable file (streamed, never stored). Resolution guarantees `userId` is an active
  // member of `farm`, so role is non-null for an authed caller.
  const role = userId ? await farmRole(prisma, farm.id, userId) : null;
  const canPersist = role === "owner" || role === "manager";
  const canExport = true; // every resolved farm (any member OR demo) may pull a downloadable file
  // Attachments are a write-capable context channel, so they are gated on canPersist: an owner/
  // manager's spreadsheet/CSV is parsed to text and PDFs/images pass through; a viewer or the
  // public Tour has any file parts stripped, so an untrusted (or read-only) caller can never push
  // file bytes into the model. Read-only otherwise: attachments are context, never a data write.
  const preparedMessages = canPersist
    ? await parseSpreadsheetAttachments(uiMessages)
    : stripFileAttachments(uiMessages);
  // Validate the requested model against the allowlist (a bad/forged value falls back to Opus 4.8) so
  // an arbitrary model string can never reach the gateway. The stub path ignores it (offline/CI).
  const responder = defaultAlmondResponder(resolveModel(requestedModel));
  try {
    return await responder.toResponse({
      uiMessages: preparedMessages,
      system: buildSystemPrompt(farmName),
      deps: { prisma, farmId: farm.id, farmName },
      // `authedOwner` is the persistence capability (now owner OR manager via canPersist). userId
      // rides along so a persisted export (Story 8.6) records who asked; null when the caller
      // cannot persist (a viewer or the public Tour), so a read-only caller is never recorded as
      // an author.
      actor: { authedOwner: canPersist, canExport, userId: canPersist ? userId : null },
    });
  } catch {
    // Construction/conversion errors (e.g. a malformed message reaching the live model) become a
    // clean 500 the client renders as the inline error state, never an unhandled crash.
    return Response.json({ error: "almond failed" }, { status: 500 });
  }
}
