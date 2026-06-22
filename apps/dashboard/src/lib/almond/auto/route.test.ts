import { describe, expect, it } from "vitest";
import { ALMOND_MODELS, type AlmondModelId } from "../models";
import type { AutoHeadlineKey, TurnIntent } from "./types";
import { decideFromIntent } from "./route";

// Pure, offline (zero DB, zero gateway): the router's `decideFromIntent` mapping. Every intent, under
// BOTH codegen-available flags, must resolve to an EXACT (model id, headline key), and every resolved
// id must be on the ALMOND_MODELS allowlist (the router can never name an off-allowlist model).

const ALLOWED_IDS: ReadonlySet<string> = new Set(ALMOND_MODELS.map((m) => m.id));

/** The full expected table: every intent -> (codegen-on id, codegen-off id, headline). */
const CASES: ReadonlyArray<{
  intent: TurnIntent;
  on: AlmondModelId;
  off: AlmondModelId;
  headline: AutoHeadlineKey;
}> = [
  { intent: "retrieve_cached", on: "anthropic/claude-haiku-4.5", off: "anthropic/claude-haiku-4.5", headline: "pulledCached" },
  { intent: "generate_file", on: "anthropic/claude-haiku-4.5", off: "anthropic/claude-haiku-4.5", headline: "buildingNew" },
  { intent: "navigate", on: "anthropic/claude-haiku-4.5", off: "anthropic/claude-haiku-4.5", headline: "navigated" },
  { intent: "read_answer", on: "anthropic/claude-sonnet-4.6", off: "anthropic/claude-sonnet-4.6", headline: "answeredDirect" },
  { intent: "reason_attachment", on: "anthropic/claude-opus-4.8", off: "anthropic/claude-opus-4.8", headline: "readingAttachment" },
  // The one flag-sensitive intent: Opus when codegen is configured, degraded to a deterministic Haiku
  // build when it is not. The headline stays buildingNew either way (a fresh build, not a pull).
  { intent: "codegen_bespoke", on: "anthropic/claude-opus-4.8", off: "anthropic/claude-haiku-4.5", headline: "buildingNew" },
];

describe("decideFromIntent", () => {
  for (const c of CASES) {
    it(`${c.intent} (codegen on) -> ${c.on} / ${c.headline}`, () => {
      const d = decideFromIntent(c.intent, true);
      expect(d).toEqual({ intent: c.intent, modelId: c.on, headline: c.headline });
    });

    it(`${c.intent} (codegen off) -> ${c.off} / ${c.headline}`, () => {
      const d = decideFromIntent(c.intent, false);
      expect(d).toEqual({ intent: c.intent, modelId: c.off, headline: c.headline });
    });
  }

  it("the degrade: codegen_bespoke with codegen OFF picks the deterministic Haiku build", () => {
    expect(decideFromIntent("codegen_bespoke", false).modelId).toBe("anthropic/claude-haiku-4.5");
    expect(decideFromIntent("codegen_bespoke", false).headline).toBe("buildingNew");
  });

  it("reason_attachment leads with Opus and the reading-attachment headline", () => {
    expect(decideFromIntent("reason_attachment", true).modelId).toBe("anthropic/claude-opus-4.8");
    expect(decideFromIntent("reason_attachment", true).headline).toBe("readingAttachment");
  });

  it("read_answer is the Sonnet middle tier answered directly", () => {
    expect(decideFromIntent("read_answer", true).modelId).toBe("anthropic/claude-sonnet-4.6");
    expect(decideFromIntent("read_answer", true).headline).toBe("answeredDirect");
  });

  it("ALLOWLIST INVARIANT: every resolved model id is a member of ALMOND_MODELS, under both flags", () => {
    for (const c of CASES) {
      expect(ALLOWED_IDS.has(decideFromIntent(c.intent, true).modelId)).toBe(true);
      expect(ALLOWED_IDS.has(decideFromIntent(c.intent, false).modelId)).toBe(true);
    }
  });
});
