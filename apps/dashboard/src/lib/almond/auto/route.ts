/**
 * The Auto router's resolution: from a classified turn (intent.ts) plus a content-addressed cache
 * probe, to a concrete `AutoDecision` (a real allowlisted model id + the predicted headline key). The
 * pure mapping (`decideFromIntent`) is the unit-tested core; the cache probe is the only I/O and is
 * THROW-SAFE — any failure resolves to a MISS so a flaky cache never blocks an answer, only costs a
 * (cheap) rebuild. The route NEVER lets the classifier name a model: it returns an intent, and the
 * server-side table in types.ts picks the id, so a forged intent can never steer the gateway.
 */
import type { AlmondToolDeps } from "../tools";
import { computeCacheKey, computeFarmDataFingerprint, lookupCachedReport } from "../reports/cache";
import { modelForIntent, headlineForIntent, type AutoDecision, type TurnIntent, type AutoCacheSkill } from "./types";
import { classifyTurn } from "./intent";
import type { AttachmentKind } from "./types";

/**
 * PURE: assemble the decision for a known intent. The cheapest CAPABLE model id and the predicted
 * headline key both come from the server-side tables in types.ts; this is the unit-tested core and
 * the single place an intent becomes a concrete (model id, headline).
 */
export function decideFromIntent(intent: TurnIntent, codegenAvailable: boolean): AutoDecision {
  return { intent, modelId: modelForIntent(intent, codegenAvailable), headline: headlineForIntent(intent) };
}

/**
 * Probe the content-addressed report cache for a HIT on this file ask. Fingerprints the farm data,
 * computes the same key the export/report skills cache under, and checks for a stored row. THROW-SAFE:
 * any failure (a cache/DB hiccup) resolves to a MISS, so the router degrades to a fresh build rather
 * than failing the turn. Read-only — it never writes, only predicts whether the next build can be
 * served from cache.
 */
export async function probeAutoCache(deps: AlmondToolDeps, skill: AutoCacheSkill, request: unknown): Promise<boolean> {
  try {
    const fp = await computeFarmDataFingerprint(deps.prisma, deps.farmId);
    const key = computeCacheKey({ farmId: deps.farmId, fingerprint: fp, skill, request });
    return (await lookupCachedReport(deps.prisma, deps.farmId, key)) !== null;
  } catch {
    return false;
  }
}

/**
 * The router entry point: classify the turn, then resolve a concrete `AutoDecision`.
 *   - attachment -> `reason_attachment` (the hard override)
 *   - navigate   -> `navigate`
 *   - read       -> `read_answer`
 *   - file       -> map the pre-intent to a (cache skill, request); probe the cache. A HIT becomes
 *                   `retrieve_cached` (serve stored bytes); a MISS becomes `codegen_bespoke` when the
 *                   ask was bespoke AND codegen is configured, otherwise `generate_file` (a
 *                   deterministic build).
 * The request resolvers are passed in (not called eagerly) so a non-file turn never pays to resolve
 * export/report/codegen params it will not use.
 */
export async function routeAutoModel(args: {
  text: string;
  attachmentKinds: AttachmentKind[];
  deps: AlmondToolDeps;
  codegenOn: boolean;
  resolveExportRequest: () => unknown;
  resolveReportRequest: () => unknown;
  resolveCodegenRequest: () => unknown;
}): Promise<AutoDecision> {
  const cls = classifyTurn(args.text, args.attachmentKinds);

  if (cls.kind === "attachment") return decideFromIntent("reason_attachment", args.codegenOn);
  if (cls.kind === "navigate") return decideFromIntent("navigate", args.codegenOn);
  if (cls.kind === "read") return decideFromIntent("read_answer", args.codegenOn);

  const { skill, request }: { skill: AutoCacheSkill; request: unknown } =
    cls.pre === "export"
      ? { skill: "export", request: args.resolveExportRequest() }
      : cls.pre === "report"
        ? { skill: "report", request: args.resolveReportRequest() }
        : { skill: "codegen", request: args.resolveCodegenRequest() };

  const hit = await probeAutoCache(args.deps, skill, request);
  if (hit) return decideFromIntent("retrieve_cached", args.codegenOn);
  if (cls.pre === "codegen" && args.codegenOn) return decideFromIntent("codegen_bespoke", args.codegenOn);
  return decideFromIntent("generate_file", args.codegenOn);
}
