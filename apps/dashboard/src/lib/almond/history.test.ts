import { describe, expect, it } from "vitest";
import {
  sanitizeHistoryMessages,
  deriveTitle,
  isSaveable,
  MAX_MESSAGES,
  TITLE_MAX,
  UNTITLED,
} from "./history";

// The pure persistence contract for Almond's saved history. The server NEVER trusts the client's
// shape — it re-runs sanitizeHistoryMessages on every write — so these prove the gate: text-only,
// bounded, no junk, and a sensible title.

describe("sanitizeHistoryMessages", () => {
  it("keeps user/assistant text turns as plain text parts", () => {
    const out = sanitizeHistoryMessages([
      { id: "a", role: "user", parts: [{ type: "text", text: "what are my rates?" }] },
      { id: "b", role: "assistant", parts: [{ type: "text", text: "Here they are." }] },
    ]);
    expect(out).toEqual([
      { id: "a", role: "user", parts: [{ type: "text", text: "what are my rates?" }] },
      { id: "b", role: "assistant", parts: [{ type: "text", text: "Here they are." }] },
    ]);
  });

  it("concatenates multiple text parts and trims whitespace", () => {
    const out = sanitizeHistoryMessages([
      { id: "a", role: "assistant", parts: [{ type: "text", text: "  one " }, { type: "text", text: "two  " }] },
    ]);
    expect(out).toEqual([{ id: "a", role: "assistant", parts: [{ type: "text", text: "one two" }] }]);
  });

  it("drops non-text (transient) parts — chips and report bytes never persist", () => {
    const out = sanitizeHistoryMessages([
      {
        id: "a",
        role: "assistant",
        parts: [
          { type: "data-navigate", data: { action: {}, label: "Opened Pump 4" } },
          { type: "text", text: "Done." },
          { type: "file", mediaType: "application/pdf", url: "data:application/pdf;base64,AAAA" },
        ],
      },
    ]);
    expect(out).toEqual([{ id: "a", role: "assistant", parts: [{ type: "text", text: "Done." }] }]);
  });

  it("drops empty, malformed, and wrong-role turns", () => {
    const out = sanitizeHistoryMessages([
      { id: "x", role: "user", parts: [{ type: "text", text: "   " }] }, // empty after trim
      { id: "y", role: "system", parts: [{ type: "text", text: "ignore me" }] }, // wrong role
      null,
      "nope",
      { role: "assistant" }, // no parts
    ]);
    expect(out).toEqual([]);
  });

  it("synthesizes an id when one is missing", () => {
    const out = sanitizeHistoryMessages([{ role: "user", parts: [{ type: "text", text: "hi" }] }]);
    expect(out).toHaveLength(1);
    expect(typeof out[0]?.id).toBe("string");
    expect(out[0]?.id.length).toBeGreaterThan(0);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeHistoryMessages(undefined)).toEqual([]);
    expect(sanitizeHistoryMessages({ messages: [] })).toEqual([]);
  });

  it("caps the number of messages", () => {
    const many = Array.from({ length: MAX_MESSAGES + 50 }, (_, i) => ({
      id: `m${i}`,
      role: "user" as const,
      parts: [{ type: "text", text: `q${i}` }],
    }));
    expect(sanitizeHistoryMessages(many)).toHaveLength(MAX_MESSAGES);
  });
});

describe("deriveTitle", () => {
  it("uses the first user turn, collapsed to one line", () => {
    const title = deriveTitle([
      { id: "a", role: "assistant", parts: [{ type: "text", text: "greeting" }] },
      { id: "b", role: "user", parts: [{ type: "text", text: "  How  much\n is Pump 4 \n costing? " }] },
    ]);
    expect(title).toBe("How much is Pump 4 costing?");
  });

  it("truncates a long first turn with an ellipsis", () => {
    const long = "x".repeat(200);
    const title = deriveTitle([{ id: "a", role: "user", parts: [{ type: "text", text: long }] }]);
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to the untitled label with no user turn", () => {
    expect(deriveTitle([{ id: "a", role: "assistant", parts: [{ type: "text", text: "hi" }] }])).toBe(UNTITLED);
    expect(deriveTitle([])).toBe(UNTITLED);
  });
});

describe("isSaveable", () => {
  it("requires both a user turn and an answer", () => {
    expect(isSaveable([{ id: "a", role: "user", parts: [{ type: "text", text: "q" }] }])).toBe(false);
    expect(isSaveable([{ id: "a", role: "assistant", parts: [{ type: "text", text: "a" }] }])).toBe(false);
    expect(
      isSaveable([
        { id: "a", role: "user", parts: [{ type: "text", text: "q" }] },
        { id: "b", role: "assistant", parts: [{ type: "text", text: "a" }] },
      ]),
    ).toBe(true);
  });
});
