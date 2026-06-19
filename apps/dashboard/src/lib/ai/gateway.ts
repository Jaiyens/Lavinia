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
