import { createGateway, type LanguageModel } from "ai";

/**
 * The shared Vercel AI Gateway boundary. Two callers use it:
 *   - the bill-extraction reader (`src/lib/extract/reader.ts`, Story 1.8)
 *   - the Almond assistant responder (`src/lib/almond/responder.ts`, Story 6.1)
 *
 * Both follow the same law: dev/CI make ZERO external calls (no key -> stub/fallback),
 * and the live Gateway model is constructed only when a key is present. This module owns
 * the key resolution and model construction so the two callers can never drift.
 */

/**
 * Resolve the Gateway key, throwing if absent. The Vercel convention is
 * `AI_GATEWAY_API_KEY`; this project's `.env.local` uses `VERCEL_AI_SDK_API_KEY`, so accept
 * either. Never log the value.
 */
export function resolveGatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_SDK_API_KEY;
  if (!key) {
    throw new Error(
      "No AI Gateway key found: set AI_GATEWAY_API_KEY (or VERCEL_AI_SDK_API_KEY) in the env",
    );
  }
  return key;
}

/**
 * Whether a Gateway key is configured. Callers use this to choose between the REAL path
 * (key present) and the offline fallback (dev/CI -> zero external calls). Reads env only;
 * never constructs a client or logs the value.
 */
export function hasGatewayKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_SDK_API_KEY);
}

/**
 * Construct a live Gateway-backed language model. Defaults to Opus 4.8. Only call this when
 * `hasGatewayKey()` is true (it throws otherwise via `resolveGatewayKey`).
 */
export function createGatewayModel(modelId = "anthropic/claude-opus-4.8"): LanguageModel {
  const gateway = createGateway({ apiKey: resolveGatewayKey() });
  return gateway(modelId);
}

/**
 * Anthropic EXTENDED THINKING provider options for the codegen `generateText` calls (the openpyxl /
 * HTML writers), QUALITY ONLY — the thinking is not streamed to the UI. Through the Vercel AI Gateway,
 * a provider-specific option goes under the provider's slug ("anthropic"); the exact knob is the one in
 * the Gateway docs: `{ thinking: { type: "enabled", budgetTokens } }` (verified against
 * @ai-sdk/gateway@3.0.131 + ai@6.0.205 — node_modules/@ai-sdk/gateway/docs/00-ai-gateway.mdx).
 *
 * CONSTRAINTS Anthropic enforces: `budgetTokens` must be < the call's `maxOutputTokens`, and
 * `temperature` must be UNSET when thinking is enabled (the codegen calls set neither, so both hold —
 * `CODEGEN_MAX_OUTPUT_TOKENS` is the explicit ceiling on those calls).
 *
 * This is a SINGLE shared knob so it is trivial to disable: set `enabled: false` here (or drop the
 * `providerOptions` spread at the call sites) and the working codegen loop is untouched.
 */
export const CODEGEN_THINKING = {
  /** Flip to false to disable extended thinking everywhere without touching the call sites. */
  enabled: true,
  /** Must stay < CODEGEN_MAX_OUTPUT_TOKENS. */
  budgetTokens: 8000,
} as const;

/** The output-token ceiling on the codegen calls. Set explicitly so `CODEGEN_THINKING.budgetTokens`
 *  (8000) is comfortably < it and a long openpyxl / HTML script still fits in the remaining budget. */
export const CODEGEN_MAX_OUTPUT_TOKENS = 32000;

/** One provider's thinking option block — a valid JSON object, so the whole map is structurally a valid
 *  AI SDK `ProviderOptions` (Record<string, JSONObject>) without importing the SDK's transitive type. */
type ThinkingOptions = Record<string, { thinking: { type: "enabled"; budgetTokens: number } }>;

/** The `providerOptions` to pass to a codegen `generateText` call to turn on extended thinking, or an
 *  empty map when it is disabled (so the call is byte-for-byte the prior, known-good shape). The Gateway
 *  routes the `anthropic` block to the provider. */
export function codegenThinkingProviderOptions(): ThinkingOptions {
  if (!CODEGEN_THINKING.enabled) return {};
  return {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: CODEGEN_THINKING.budgetTokens },
    },
  };
}
