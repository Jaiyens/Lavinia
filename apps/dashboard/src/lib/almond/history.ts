// Pure helpers for Almond's saved chat history (no DB, no auth, no React) so the same
// sanitize/title logic runs on the client (before a save POST) AND authoritatively on the server
// (before a DB write). The server NEVER trusts the client's shape: it re-sanitizes here.
//
// Persistence is text-only by design. Almond's live stream carries transient parts the chat
// contract says are never replayed or stored (navigation chips, download-card bytes); we keep only
// the text parts, so reloading a thread restores the substance (the question and the markdown
// answer) without resurrecting one-shot artifacts whose bytes are already gone.

/** A persisted message: an id, a role, and its text parts only (transient parts are dropped). */
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
};

/** A thread summary for the history list (no message bodies). */
export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

// Bounds so a single thread can never bloat a JSON row without limit. Generous for a real
// conversation, firm against abuse on this authenticated endpoint.
export const MAX_MESSAGES = 400;
export const MAX_TEXT_LEN = 24_000;
export const TITLE_MAX = 80;

/** The title shown for a thread with no usable first user turn yet. */
export const UNTITLED = "New chat";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Flatten an unknown message's parts into a single trimmed text string (text parts only). */
function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const p of parts) {
    if (isRecord(p) && p.type === "text" && typeof p.text === "string") out += p.text;
  }
  return out;
}

/**
 * Sanitize an arbitrary value into the stored shape: keep only user/assistant messages that carry
 * text, cap the count and per-message length, and coerce every part to a plain text part. A
 * malformed or oversized payload yields a safe, bounded array rather than throwing.
 */
export function sanitizeHistoryMessages(input: unknown): StoredMessage[] {
  if (!Array.isArray(input)) return [];
  const out: StoredMessage[] = [];
  for (const raw of input) {
    if (out.length >= MAX_MESSAGES) break;
    if (!isRecord(raw)) continue;
    const role = raw.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = textOf(raw.parts).slice(0, MAX_TEXT_LEN).trim();
    if (!text) continue; // drop empty / attachment-only / transient-only turns
    const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `m-${out.length}`;
    out.push({ id, role, parts: [{ type: "text", text }] });
  }
  return out;
}

/**
 * The thread's title: the first user turn, collapsed to one line and truncated. Falls back to the
 * untitled label when there is no user text yet (an assistant-only or empty thread).
 */
export function deriveTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const raw = firstUser ? firstUser.parts.map((p) => p.text).join(" ") : "";
  const line = raw.replace(/\s+/g, " ").trim();
  if (!line) return UNTITLED;
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

/** Whether a sanitized thread is worth saving: it has at least one user turn and one answer. */
export function isSaveable(messages: StoredMessage[]): boolean {
  return messages.some((m) => m.role === "user") && messages.some((m) => m.role === "assistant");
}
