// THE ZDR BOUNDARY (Crops rule 6).
//
// Grower production data — packer-statement pounds, varieties, settlement figures — is the
// grower's commercial secret. It must NEVER transit the Vercel AI Gateway (`@/lib/ai/gateway.ts`),
// which is a third-party proxy that can log and retain payloads. Instead it goes through the DIRECT
// Anthropic endpoint configured for ZERO DATA RETENTION: a separate key (`ANTHROPIC_ZDR_API_KEY`)
// scoped to a ZDR-enrolled Anthropic organization, talking straight to api.anthropic.com so no
// intermediary ever sees the rows.
//
// This module is the ONLY door grower extraction may use. It mirrors `gateway.ts`'s discipline
// (resolveKey throws-if-absent and NEVER logs the value; hasKey(); createModel()) but is a strictly
// separate provider, and it MUST NOT import `@/lib/ai/gateway`. An import-guard test
// (`src/lib/crops/extract/zdr-boundary.test.ts`) fails the build if anyone ever wires the two
// together. dev/CI make ZERO external calls: no key -> the stub reader is used, never this provider.

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Resolve the ZDR Anthropic key, throwing if absent. Distinct env var from the Gateway key on
 * purpose: this one belongs to the zero-data-retention org. Never log the value (the message names
 * the var, never the secret) — mirrors `resolveGatewayKey`.
 */
export function resolveZdrKey(): string {
  const key = process.env.ANTHROPIC_ZDR_API_KEY;
  if (!key) {
    throw new Error(
      "No ZDR Anthropic key found: set ANTHROPIC_ZDR_API_KEY (zero-data-retention org) in the env",
    );
  }
  return key;
}

/**
 * Whether a ZDR key is configured. Grower-extraction callers use this to fail closed: no key ->
 * NEVER call out (the stream route returns 503, the reader degrades to needs_review). Reads env
 * only; never constructs a client or logs the value.
 */
export function hasZdrKey(): boolean {
  return Boolean(process.env.ANTHROPIC_ZDR_API_KEY);
}

/**
 * Construct a live language model over the DIRECT Anthropic ZERO-DATA-RETENTION endpoint. Defaults
 * to Opus 4.8; the extraction reader runs Sonnet 4.6 first and escalates to Opus on low confidence
 * or a pound-gate near-miss. Bare Anthropic model IDs (no `anthropic/` provider prefix — that is the
 * Gateway's vocabulary, which this boundary deliberately does not speak). Only call when
 * `hasZdrKey()` is true (it throws otherwise via `resolveZdrKey`).
 *
 * `anthropic-version: 2023-06-01` is the pinned Messages API version. The ZDR posture itself is a
 * property of the ANTHROPIC_ZDR_API_KEY's org enrollment; constructing the client with that key and
 * the canonical baseURL is what keeps grower rows off any retaining intermediary.
 */
export function createZdrModel(modelId = "claude-opus-4-8"): LanguageModel {
  const anthropic = createAnthropic({
    apiKey: resolveZdrKey(),
    headers: { "anthropic-version": "2023-06-01" },
  });
  return anthropic(modelId);
}
