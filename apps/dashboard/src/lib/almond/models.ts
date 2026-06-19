/**
 * The curated model menu for Almond's chat (the picker a grower can switch between).
 *
 * Each entry is a Vercel AI Gateway `provider/model` string — the SAME format
 * `createGatewayModel` already hands the gateway (see `src/lib/ai/gateway.ts`) — plus a plain
 * label for the picker. This list is an ALLOWLIST on purpose: the chat route validates the
 * client's requested model against it (`resolveModel`) before constructing anything, so the
 * public/Tour fallback endpoint can never be steered to an arbitrary (or expensive) model string.
 *
 * Opus 4.8 leads and is the default — it has the strongest document/vision handling for the bills
 * and spreadsheets a grower can now attach. The Claude ids are the bare Anthropic ids the gateway
 * expects (matching `gateway.ts`). The GPT and Gemini ids are current Vercel AI Gateway slugs; if a
 * provider renames a model the gateway returns an error the route surfaces as the inline chat error,
 * so a stale slug degrades gracefully rather than crashing — confirm exact slugs in the Vercel AI
 * Gateway catalog when adding or rotating models here.
 */
export type AlmondModelProvider = "Anthropic" | "OpenAI" | "Google";

export type AlmondModel = {
  /** The Gateway `provider/model` string passed to `createGatewayModel`. */
  readonly id: string;
  /** Plain label for the picker (no jargon). */
  readonly label: string;
  readonly provider: AlmondModelProvider;
};

export const ALMOND_MODELS = [
  { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", provider: "Anthropic" },
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "openai/gpt-5.1", label: "GPT-5.1", provider: "OpenAI" },
  { id: "google/gemini-3-pro", label: "Gemini 3 Pro", provider: "Google" },
] as const satisfies readonly AlmondModel[];

export type AlmondModelId = (typeof ALMOND_MODELS)[number]["id"];

/** The default model: Claude Opus 4.8, the strongest at reading attached bills/spreadsheets. */
export const DEFAULT_ALMOND_MODEL: AlmondModelId = ALMOND_MODELS[0].id;

const ALLOWED_IDS: ReadonlySet<string> = new Set(ALMOND_MODELS.map((m) => m.id));

/** Whether an arbitrary value is one of the allowlisted model ids. */
export function isAllowedModel(id: unknown): id is AlmondModelId {
  return typeof id === "string" && ALLOWED_IDS.has(id);
}

/**
 * Validate a client-supplied model id, falling back to the default when absent or not on the
 * allowlist. The route uses this so a bad/forged `model` in the request body can never reach the
 * gateway — it quietly becomes the default instead.
 */
export function resolveModel(id: unknown): AlmondModelId {
  return isAllowedModel(id) ? id : DEFAULT_ALMOND_MODEL;
}
