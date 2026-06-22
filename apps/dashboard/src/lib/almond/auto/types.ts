/**
 * The Auto router contract (Perplexity-Auto for Almond). PURE + deterministic: every type here is a
 * closed union and every function over them is a pure mapping with no I/O, so the whole module is
 * unit-testable in CI with no gateway key and no DB. The router classifies a turn into a `TurnIntent`,
 * then a server-side table maps that intent to a CONCRETE allowlisted `AlmondModelId` — the model id
 * is NEVER named by the classifier or the client (ADR-A08 extended to the router), and the resolved id
 * is the SAME id that is run and metered (recordUsage model: modelId), never the literal "auto".
 */
import type { AlmondModelId } from "../models";

/**
 * The kind of attachment surviving the route's attachment prep, derived SERVER-SIDE from the prepared
 * message parts (never from the model or client). Spreadsheets are parsed to text upstream for an
 * owner, so by the time the router sees a turn a surviving `file` part is a PDF or image the live model
 * would read natively; the presence of ANY such part forces the deep-reasoning intent.
 */
export type AttachmentKind = "pdf" | "image" | "other";

/**
 * The six deterministic turn intents. Derivation order (mirrors the stub's capability order so the live
 * and offline paths agree by construction):
 *   1. attachment present            -> `reason_attachment` (hard server-side override, wins over all)
 *   2. file ask (verb + object noun) -> `retrieve_cached` (cache HIT) | `codegen_bespoke` (bespoke
 *                                       wording + codegen available, MISS) | `generate_file` (MISS)
 *   3. navigation (verb or lens word)-> `navigate`
 *   4. otherwise                     -> `read_answer`
 */
export type TurnIntent =
  | "retrieve_cached"
  | "generate_file"
  | "codegen_bespoke"
  | "read_answer"
  | "navigate"
  | "reason_attachment";

/**
 * The copy KEY for the one honest "what Auto decided" line (resolved to text in `en.shell.almond.auto`,
 * so the user-facing string stays localization-ready and em-dash-free). It is a KEY, not a string, on
 * purpose. NOTE the headline can be CORRECTED downstream: a file intent the router predicted as a HIT
 * but that turns out stale builds fresh, so the responder swaps `pulledCached` -> `buildingNew` from
 * the ACTUAL `fromCache` flag, never lying about whether bytes were pulled or built.
 */
export type AutoHeadlineKey =
  | "pulledCached"
  | "buildingNew"
  | "answeredDirect"
  | "navigated"
  | "readingAttachment";

/**
 * The router's decision for a turn. `modelId` is ALWAYS a real, allowlisted `AlmondModelId` (so the
 * downstream gateway/usage path is byte-identical to a hand-picked model), `intent` is the deterministic
 * classification, and `headline` is the copy key for the decided line.
 */
export type AutoDecision = {
  readonly modelId: AlmondModelId;
  readonly intent: TurnIntent;
  readonly headline: AutoHeadlineKey;
};

/**
 * The transient payload the responder writes (data-decided) and the client buffers. Only the headline
 * key crosses the wire; the concrete model id stays server-side (it is already recorded on the usage
 * row and need not be shown). Kept minimal and additive to the `AlmondUIMessage` data-part map.
 */
export type AutoDecided = { readonly headline: AutoHeadlineKey };

/** The cache namespace a file intent probes, mirroring `CacheSkill` in reports/cache.ts. */
export type AutoCacheSkill = "export" | "report" | "codegen";

/**
 * Pure: map a `TurnIntent` to the cheapest CAPABLE concrete model. Server-side authority — the classifier
 * returns only the intent, this table picks the id, so a hallucinated/forged intent can never name a
 * pricier or off-allowlist model. The `codegenAvailable` flag degrades a bespoke ask to a deterministic
 * build (Haiku) when codegen is not configured, so a codegen-style ask never wastes an Opus turn it
 * cannot fulfil.
 */
export function modelForIntent(intent: TurnIntent, codegenAvailable: boolean): AlmondModelId {
  switch (intent) {
    case "retrieve_cached":
      // Pulling something we already made: the cache HIT serves stored bytes with zero regeneration;
      // the model only narrates the download card. Cheapest capable model.
      return "anthropic/claude-haiku-4.5";
    case "navigate":
      // Pure URL-state move; the model only emits the structured navigate input. No reasoning depth.
      return "anthropic/claude-haiku-4.5";
    case "generate_file":
      // A DETERMINISTIC skill (pure-JS xlsx / react-pdf) authors every byte; the model only orchestrates
      // the tool call and picks the shape. Haiku-when-a-deterministic-skill-builds-the-file.
      return "anthropic/claude-haiku-4.5";
    case "read_answer":
      // The sensible middle tier: a grounded read-only answer over farm data via the read tools. Also
      // the safe default for an ambiguous turn (verb+noun gate biases ambiguity here).
      return "anthropic/claude-sonnet-4.6";
    case "reason_attachment":
      // An attached bill/spreadsheet/PDF needs the strongest document/vision handling — Opus 4.8.
      return "anthropic/claude-opus-4.8";
    case "codegen_bespoke":
      // A brand-new bespoke artifact: Opus orchestrates at the top level (the nested codegen build step
      // keeps its own hardcoded Sonnet 4.6 inside the sandbox; the router does not touch that). If
      // codegen is NOT configured, degrade to a deterministic build on Haiku rather than a stranded Opus
      // turn that cannot reach the codegen skill.
      return codegenAvailable ? "anthropic/claude-opus-4.8" : "anthropic/claude-haiku-4.5";
  }
}

/** Pure: the copy key for an intent's decided line. For a file intent this is the PREDICTED key; the
 *  responder corrects pulledCached/buildingNew from the real fromCache outcome. */
export function headlineForIntent(intent: TurnIntent): AutoHeadlineKey {
  switch (intent) {
    case "retrieve_cached":
      return "pulledCached";
    case "generate_file":
    case "codegen_bespoke":
      return "buildingNew";
    case "navigate":
      return "navigated";
    case "reason_attachment":
      return "readingAttachment";
    case "read_answer":
      return "answeredDirect";
  }
}

/** Which cache namespace a file intent probes. read_answer/navigate/reason_attachment have no cacheable
 *  artifact and return null (the router skips the probe for them). */
export function cacheSkillForIntent(intent: TurnIntent): AutoCacheSkill | null {
  switch (intent) {
    case "retrieve_cached":
    case "generate_file":
      // Whether a file ask is export- vs report-shaped is resolved by the file-intent classifier; this
      // returns the default namespace and the router refines it (export|report|codegen) — see route.ts.
      return "report";
    case "codegen_bespoke":
      return "codegen";
    default:
      return null;
  }
}
