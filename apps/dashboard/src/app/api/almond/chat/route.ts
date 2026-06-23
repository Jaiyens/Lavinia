import { after } from "next/server";
import type { UIMessage } from "ai";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { farmRole, farmAccess } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm, demoFarm } from "@/lib/onboarding/farm";
import { buildSystemPrompt } from "@/lib/almond/persona";
import { defaultAlmondResponder } from "@/lib/almond/responder";
import { resolveModel, isAutoChoice } from "@/lib/almond/models";
import { routeAutoModel } from "@/lib/almond/auto/route";
import { attachmentKindsFromMessages, classifyTurn } from "@/lib/almond/auto/intent";
import type { AutoHeadlineKey, TurnIntent } from "@/lib/almond/auto/types";
import { parseSpreadsheetAttachments, stripFileAttachments } from "@/lib/almond/attachments/parse";
import { checkChatRateLimit, clientIp } from "@/lib/almond/rate-limit";
import { checkUsageBudget } from "@/lib/almond/usage-budget";
import { hasGatewayKey } from "@/lib/ai/gateway";
import { isCodegenExportAvailable } from "@/lib/almond/codegen/flags";
import { runGenerationJob } from "@/lib/almond/codegen/run-job";

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

  // Durable per-user TOKEN budget (Story 10.4): the un-bypassable cost ceiling, checked here BEFORE
  // any farm read or model call so an over-budget user costs zero Gateway spend. Unlike the per-IP
  // limiter above (in-memory, per-instance, resets on restart), this is summed from Postgres rows
  // keyed on the immutable User.id — so reload, restart, cleared cookies, incognito, and a different
  // serverless instance all read the SAME ledger and cannot reset it. The public Tour / demo (no
  // userId) is not metered per-user; the per-IP limit bounds it instead.
  if (userId) {
    const budget = await checkUsageBudget(prisma, userId);
    if (!budget.allowed) {
      return Response.json(
        { error: "usage_limit", window: budget.window, resetAt: budget.resetAt },
        { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } },
      );
    }
  }

  // Signed-in: a farm they are an active member of, selected by the validated active-farm
  // cookie. Public Tour (no session): the demo farm, read-only — Almond is part of the full tour
  // now, never a leak (demoFarm is isDemo-only, never real data).
  const activeId = await activeFarmId(userId);
  // Almond must never dead-end on a 400 just because the caller has no farm yet. A signed-in user
  // who has not finished onboarding (no accessible+ready farm) falls back to the representative demo
  // farm, exactly like the public Tour, so Almond still answers. This stays read-only: `canPersist`
  // below is false because they are not a member of the demo farm. Dashboard PAGES still route such a
  // user to onboarding (dashboardFarm returns null); this fallback is scoped to the chat endpoint.
  const resolved =
    (userId ? await dashboardFarm(prisma, userId, activeId) : null) ?? (await demoFarm(prisma));
  if (!resolved) {
    return Response.json({ error: "no farm" }, { status: 400 });
  }

  let uiMessages: UIMessage[];
  // The grower's chosen model rides on the body too (Story: model picker). Captured here, validated
  // against the allowlist below — never trusted as-is.
  let requestedModel: unknown;
  let chatId: string | undefined;
  try {
    const body: unknown = await req.json();
    const obj =
      body && typeof body === "object"
        ? (body as { id?: unknown; message?: unknown; messages?: unknown; model?: unknown })
        : {};
    const messages = resolveRequestMessages(obj);
    if (messages.length === 0) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }
    uiMessages = messages;
    requestedModel = obj.model;
    chatId = typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id : undefined;
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
  const canPersist = role ? farmAccess(role).canManageData : false;
  const canExport = true; // every resolved farm (any member OR demo) may pull a downloadable file
  // Attachments are a write-capable context channel, so they are gated on canPersist: an owner/
  // manager's spreadsheet/CSV is parsed to text and PDFs/images pass through; a viewer or the
  // public Tour has any file parts stripped, so an untrusted (or read-only) caller can never push
  // file bytes into the model. Read-only otherwise: attachments are context, never a data write.
  const preparedMessages = canPersist
    ? await parseSpreadsheetAttachments(uiMessages)
    : stripFileAttachments(uiMessages);
  // Resolve the model. Two paths:
  //   - Auto (the sentinel "auto"): the grower let Almond pick. The Auto router classifies the turn
  //     server-side (text + server-derived attachment kinds) and returns a CONCRETE allowlisted id PLUS
  //     the decided-line headline — the classifier never names a model (ADR-A08), so a forged intent
  //     cannot steer the gateway. A file ask builds from scratch (no cache). The decided line rides
  //     through to the responder so the user sees one honest "what Auto decided" line.
  //   - Otherwise: validate the client's requested id against the allowlist (`resolveModel`), so a
  //     bad/forged value falls back to Opus 4.8 and an arbitrary string never reaches the gateway. The
  //     stub path ignores it (offline/CI). A forged "auto" reaching this path is not allowlisted, so it
  //     too falls back to the default.
  let modelId: string;
  let decided: { headline: AutoHeadlineKey } | undefined;
  let allowHarness = true;
  if (isAutoChoice(requestedModel)) {
    const lastText = lastUserTextFor(preparedMessages);
    const attachmentKinds = attachmentKindsFromMessages(preparedMessages);
    // From-scratch codegen is the file path when the Gateway key + a runtime are present; the router
    // uses this only for symmetry (Sonnet orchestrates the file tool call either way).
    const codegenOn = canExport && isCodegenExportAvailable(hasGatewayKey());
    const decision = routeAutoModel({ text: lastText, attachmentKinds, codegenOn });
    modelId = decision.modelId;
    decided = { headline: decision.headline };
    allowHarness = !requiresAlmondSideEffects(decision.intent);
  } else {
    const turn = classifyTurn(lastUserTextFor(preparedMessages), attachmentKindsFromMessages(preparedMessages));
    modelId = resolveModel(requestedModel);
    decided = undefined;
    allowHarness = turn.kind !== "file" && turn.kind !== "navigate";
  }
  const responder = defaultAlmondResponder(modelId, decided, { allowHarness });
  // The SHARED sink for background-generation job ids (Almond v2 Phase 2). A model-authored
  // spreadsheet/PDF no longer builds inside the tool `execute` (a ~30-90s build would die when the grower
  // leaves the page); instead the codegen tool ENQUEUES a GenerationJob row and PUSHES its id here, and
  // we run the build in a Next `after()` callback (below) once the response stream has finished.
  const pendingGenerations: string[] = [];
  // The user the finished report is recorded under: the SAME persist-gated id `actor.userId` uses (an
  // owner/manager who may keep files), null for a viewer or the public Tour. Resolved here so the
  // background runner records authorship exactly as the synchronous responder did.
  const persistingUserId = canPersist ? userId : null;
  try {
    const res = await responder.toResponse({
      uiMessages: preparedMessages,
      // The caller's role rides into the system prompt so Almond phrases capability accurately (a
      // viewer is read-only; an owner/manager may also build and keep files). Server-resolved, never
      // from the client; null for the public Tour / demo viewer.
      system: buildSystemPrompt(farmName, role),
      // `chatId` lets the harness path resume its sandbox session (co-founder's agent-SDK); the
      // responder ignores it on the Gateway path. Harmless to pass on both.
      chatId,
      decided,
      // `meterUserId` is the TRUE session id (ungated by canPersist), so usage metering counts every
      // authed user INCLUDING a read-only viewer — `actor.userId` below stays persist-gated for the
      // separate "who authored this export" concern. `pendingGenerations` is the SAME array the
      // `after()` below drains — captured by reference, empty now, populated by the tool `execute`.
      deps: { prisma, farmId: farm.id, farmName, meterUserId: userId, pendingGenerations },
      // `authedOwner` is the persistence capability (now owner OR manager via canPersist). userId
      // rides along so a persisted export (Story 8.6) records who asked; null when the caller
      // cannot persist (a viewer or the public Tour), so a read-only caller is never recorded as
      // an author.
      actor: { authedOwner: canPersist, canExport, userId: canPersist ? userId : null, role },
    });

    // THE CRUX OF "survive leaving the page" (read this carefully): `responder.toResponse` returns the
    // streaming Response BEFORE its stream body runs — the tool-calling loop (and so the codegen tool's
    // `execute`, which pushes onto `pendingGenerations`) only runs as the client CONSUMES the stream.
    // `after()` registers a callback Next runs once the response (including the streamed body) has fully
    // finished. So at REGISTRATION time `pendingGenerations` is still empty, but the closure captures it
    // BY REFERENCE and reads it at CALLBACK time — by which point the stream has finished and every tool
    // `execute` has pushed its jobId. We therefore drain the populated array here, running each enqueued
    // build in the background. Because the build runs AFTER the response is delivered, a closed tab does
    // not kill it; `runGenerationJob` is idempotent + fail-safe (it flips the job to done/failed and
    // never throws out). Scope (`farmId`) and authorship (`createdById`) come from the server, never the
    // model.
    after(async () => {
      for (const jobId of pendingGenerations) {
        await runGenerationJob(
          {
            prisma,
            farmId: farm.id,
            farmName,
            meterUserId: userId,
            createdById: persistingUserId,
            // The runner enqueues no further jobs; an empty sink keeps the deps type satisfied.
            pendingGenerations: [],
          },
          jobId,
        );
      }
    });

    return res;
  } catch (error) {
    console.error("[almond chat 500]", error);
    // Construction/conversion errors (e.g. a malformed message reaching the live model) become a
    // clean 500 the client renders as the inline error state, never an unhandled crash.
    return Response.json({ error: "almond failed" }, { status: 500 });
  }
}

/**
 * The latest user turn's text, lower-cased and trimmed — the Auto router's text input. Mirrors the
 * responder's private `lastUserText` (kept local so the route does not reach into responder internals):
 * walk messages from the end, take the first `user` turn, concatenate its text parts, lower-case, trim.
 */
function lastUserTextFor(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser === undefined) return "";
  return (lastUser.parts ?? [])
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .toLowerCase()
    .trim();
}

function resolveRequestMessages(body: { message?: unknown; messages?: unknown }): UIMessage[] {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages as UIMessage[];
  }
  return isUIMessageLike(body.message) ? [body.message] : [];
}

function isUIMessageLike(value: unknown): value is UIMessage {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { role?: unknown }).role === "string" &&
    Array.isArray((value as { parts?: unknown }).parts)
  );
}

function requiresAlmondSideEffects(intent: TurnIntent): boolean {
  // A file build (codegen/export) and a navigation both run through the responder's tools, so the
  // harness must be bypassed for them. (The cache-probe / bespoke-codegen intents were removed when the
  // Auto router went always-build-fresh, so `generate_file` is the single file-side-effect intent now.)
  return intent === "generate_file" || intent === "navigate";
}
