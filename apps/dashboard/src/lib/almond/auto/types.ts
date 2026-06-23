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
 * The four deterministic turn intents. Derivation order (mirrors the stub's capability order so the live
 * and offline paths agree by construction):
 *   1. attachment present            -> `reason_attachment` (hard server-side override, wins over all)
 *   2. file ask (verb + object noun) -> `generate_file` (build the file FROM SCRATCH — no cache probe)
 *   3. navigation (verb or lens word)-> `navigate`
 *   4. otherwise                     -> `read_answer`
 */
export type TurnIntent =
  | "generate_file"
  | "read_answer"
  | "navigate"
  | "reason_attachment";

/**
 * The copy KEY for the one honest "what Auto decided" line (resolved to text in `en.shell.almond.auto`,
 * so the user-facing string stays localization-ready and em-dash-free). It is a KEY, not a string, on
 * purpose. A file ask always builds fresh now (no cache), so the headline is `buildingNew` with no
 * downstream correction.
 */
export type AutoHeadlineKey =
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

/**
 * Pure: map a `TurnIntent` to the cheapest CAPABLE concrete model. Server-side authority — the classifier
 * returns only the intent, this table picks the id, so a hallucinated/forged intent can never name a
 * pricier or off-allowlist model. The `codegenAvailable` flag degrades a bespoke ask to a deterministic
 * build (Haiku) when codegen is not configured, so a codegen-style ask never wastes an Opus turn it
 * cannot fulfil.
 */
export function modelForIntent(intent: TurnIntent, _codegenAvailable: boolean): AlmondModelId {
  switch (intent) {
    case "navigate":
      // Pure URL-state move; the model only emits the structured navigate input. No reasoning depth.
      return "anthropic/claude-haiku-4.5";
    case "generate_file":
      // The model orchestrates the file tool call: it passes the grower's request (and any styling) to
      // the from-scratch codegen skill, or picks the deterministic shape when codegen is off. Sonnet
      // handles both; the heavy code-writing happens in the nested codegen model, not here.
      return "anthropic/claude-sonnet-4.6";
    case "read_answer":
      // The sensible middle tier: a grounded read-only answer over farm data via the read tools. Also
      // the safe default for an ambiguous turn (verb+noun gate biases ambiguity here).
      return "anthropic/claude-sonnet-4.6";
    case "reason_attachment":
      // An attached bill/spreadsheet/PDF needs the strongest document/vision handling.
      return "anthropic/claude-opus-4.8";
  }
}

/** Pure: the copy key for an intent's decided line. A file ask always builds fresh now (no cache). */
export function headlineForIntent(intent: TurnIntent): AutoHeadlineKey {
  switch (intent) {
    case "generate_file":
      return "buildingNew";
    case "navigate":
      return "navigated";
    case "reason_attachment":
      return "readingAttachment";
    case "read_answer":
      return "answeredDirect";
  }
}
