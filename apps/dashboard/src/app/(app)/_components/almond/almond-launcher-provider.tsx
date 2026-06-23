"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import type { NavigateAction } from "@/lib/almond/skills/navigate";
import type { AlmondReportData, AlmondMeterData } from "@/lib/almond/responder";
import {
  AUTO_SENTINEL,
  isAllowedModel,
  isAutoChoice,
  type AlmondModelChoice,
} from "@/lib/almond/models";
import type { AutoDecided, AutoHeadlineKey } from "@/lib/almond/auto/types";
import {
  sanitizeHistoryMessages,
  isSaveable,
  type StoredMessage,
  type ConversationSummary,
} from "@/lib/almond/history";
import type { AlmondNavChip } from "./almond-result";
import type { AlmondReportCard } from "./almond-download-card";
import type { AlmondMeterCard } from "./almond-meter-card";
import { useAlmondNavigation } from "./use-almond-navigation";

// The ONE Almond conversation, lifted to a context so BOTH surfaces share it: the floating panel
// (quick-ask from any screen) and the dedicated /almond full-page tab. Previously this provider held
// only the open/close boolean and the conversation lived inside AlmondLauncher; promoting the whole
// chat here is what lets the panel and the page show the same thread, the same model choice, and the
// same captured action-chips / download-cards. No global state lib — one typed context with a few
// known consumers. Must render under the nuqs adapter (the navigation bridge uses useQueryState).

/**
 * Almond's chat carries these custom transient stream parts:
 *   - `data-navigate` (Story 7.5): a navigation `action` plus a plain-English `label` for the chip.
 *   - `data-report` (Story 8.5): a file Almond made (base64 bytes + file name), rendered as a
 *     download card. Transient, so the bytes are delivered once and never replayed or persisted.
 *   - `data-meter` (B2): one meter's MeterDetail, rendered as a light inline card right in the chat
 *     (no page jump). Transient, like the others.
 */
export type AlmondUIMessage = UIMessage<
  unknown,
  {
    navigate: { action: NavigateAction; label: string };
    report: AlmondReportData;
    decided: AutoDecided;
    meter: AlmondMeterData;
  }
>;

type AlmondChatStatus = "submitted" | "streaming" | "ready" | "error";

/** Set when the durable per-user token budget is hit (the chat route's 429). Carries which window
 *  was exhausted and when it resets, for a clear banner instead of the generic error. */
export type AlmondUsageLimit = { window: "daily" | "weekly"; resetAt: string };

type AlmondChatValue = {
  // Panel open/close (the page does not use these, but the FAB + rail + nudge do).
  open: boolean;
  setOpen: (open: boolean) => void;
  openAlmond: () => void;
  closeAlmond: () => void;
  // Per-farm config, resolved server-side and threaded down to both surfaces.
  farmName: string;
  starters: string[];
  /** Whether the caller may attach files (authed owner only; the public Tour cannot). */
  canAttach: boolean;
  // Model picker.
  model: AlmondModelChoice;
  setModel: (id: AlmondModelChoice) => void;
  // The conversation, shared by the panel and the page.
  messages: AlmondUIMessage[];
  status: AlmondChatStatus;
  /** Set when the grower has hit their durable per-user token budget (a 429 from the chat route);
   *  null otherwise. Drives the limit-reached banner + composer lockout; cleared on the next send. */
  usageLimit: AlmondUsageLimit | null;
  /** Send a turn with optional file attachments (PDF / Excel / CSV). */
  send: (text: string, files?: File[]) => void;
  retry: () => void;
  /** Re-ask an earlier user turn with edited text: drop that turn and everything after it, then
   *  resend. Powers the per-message Edit control. */
  editMessage: (messageId: string, newText: string) => void;
  navByMessage: Map<string, AlmondNavChip[]>;
  reportsByMessage: Map<string, AlmondReportCard[]>;
  /** Light inline meter cards per assistant message id (B2). */
  metersByMessage: Map<string, AlmondMeterCard[]>;
  /** The "what Auto decided" headline key per assistant message id (Auto mode only). */
  decidedByMessage: Map<string, AutoHeadlineKey>;
  onReplay: (chip: AlmondNavChip) => void;
  announcement: { text: string; seq: number };
  // --- Saved history (per-user, per-farm). Off on the public Tour (no session) -------------------
  /** Whether saved history is available (a signed-in grower). The Tour never persists. */
  historyEnabled: boolean;
  /** The grower's own threads for the active farm, newest-first. */
  conversations: ConversationSummary[];
  /** Whether the initial history list is still loading. */
  historyLoading: boolean;
  /** The thread currently on screen, or null for an unsaved new chat. */
  activeConversationId: string | null;
  /** Clear the surface to a fresh, unsaved thread (the "New chat" affordance). */
  newChat: () => void;
  /** Load a saved thread by id and make it the active conversation. */
  loadConversation: (id: string) => void;
  /** Delete a saved thread (optimistic). Clears the surface if it was the active one. */
  deleteConversation: (id: string) => void;
};

const AlmondChatContext = createContext<AlmondChatValue | null>(null);

/** Appended to the live-region text on alternating announcements so an identical label still changes
 *  the DOM text and is re-announced. Zero-width (U+200B): invisible and not spoken by screen readers. */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

const MODEL_STORAGE_KEY = "almond.model";

/** The id of the most recent assistant message, or undefined if none exists yet. Never falls back to
 *  a user message — a chip keyed to a user turn would never render (it only renders in the assistant
 *  bubble), so an unattributable chip stays buffered until its assistant message appears. */
function lastAssistantId(messages: AlmondUIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i]?.id;
  }
  return undefined;
}

/** A stable identity for an action chip (its navigation + its label), used to drop duplicates. */
function chipKey(chip: AlmondNavChip): string {
  return `${JSON.stringify(chip.action)}|${chip.label}`;
}

/** Drop duplicate chips (same navigation + label), keeping first-seen order. Belt-and-suspenders to
 *  the server's per-turn navigate dedupe: a single turn that drove one move shows exactly one chip. */
function dedupeChips(chips: AlmondNavChip[]): AlmondNavChip[] {
  const seen = new Set<string>();
  const out: AlmondNavChip[] = [];
  for (const chip of chips) {
    const key = chipKey(chip);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(chip);
    }
  }
  return out;
}

/** Drop duplicate download cards (same file name), keeping first-seen order. Belt-and-suspenders to
 *  the server's per-turn file dedupe: one generated file shows exactly one card, never two. */
function dedupeReports(reports: AlmondReportCard[]): AlmondReportCard[] {
  const seen = new Set<string>();
  const out: AlmondReportCard[] = [];
  for (const report of reports) {
    if (!seen.has(report.fileName)) {
      seen.add(report.fileName);
      out.push(report);
    }
  }
  return out;
}

/** Drop duplicate meter cards (same meter id), keeping first-seen order. Belt-and-suspenders to the
 *  server's per-turn meter dedupe: one meter shows exactly one card, never two (B2). */
function dedupeMeters(meters: AlmondMeterCard[]): AlmondMeterCard[] {
  const seen = new Set<string>();
  const out: AlmondMeterCard[] = [];
  for (const card of meters) {
    if (!seen.has(card.meter.id)) {
      seen.add(card.meter.id);
      out.push(card);
    }
  }
  return out;
}

/** A cheap content fingerprint for a saved thread, so an unchanged conversation is never re-saved.
 *  Final answer length is stable once a turn completes (we only save then), so count + last id +
 *  last text length uniquely identifies a settled exchange. */
function historyFingerprint(stored: StoredMessage[]): string {
  const last = stored[stored.length - 1];
  return `${stored.length}|${last?.id ?? ""}|${last?.parts[0]?.text.length ?? 0}`;
}

/** Read a File into a base64 Data URL (browser only; called on a user send). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/** Convert picked files into AI SDK file parts (the server parses spreadsheets to text and lets the
 *  model read PDFs/images natively). */
async function filesToParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (f) => ({
      type: "file" as const,
      mediaType: f.type || "application/octet-stream",
      filename: f.name,
      url: await fileToDataUrl(f),
    })),
  );
}

export function AlmondChatProvider({
  farmName,
  starters,
  canAttach,
  historyEnabled = false,
  children,
}: {
  farmName: string;
  starters: string[];
  canAttach: boolean;
  /** Whether to persist + offer saved history (true for a signed-in grower, false for the Tour). */
  historyEnabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openAlmond = useCallback(() => setOpen(true), []);
  const closeAlmond = useCallback(() => setOpen(false), []);

  // Chosen model. Starts at Auto (the default) for an SSR-safe first render, then hydrates from
  // localStorage so a grower's pick sticks between visits (a farmer specifically liked switching).
  const [model, setModelState] = useState<AlmondModelChoice>(AUTO_SENTINEL);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      // One-time hydration of the persisted pick after mount. setState-in-effect is the correct
      // pattern here (localStorage can't be read during SSR/render without a hydration mismatch);
      // SSR and the first client render both show the default, then this syncs the saved choice.
      // Accept a concrete allowlisted id or the Auto sentinel; anything else falls through to Auto.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isAllowedModel(saved) || isAutoChoice(saved)) setModelState(saved);
    } catch {
      // localStorage may be unavailable (privacy mode) — the default is fine.
    }
  }, []);
  const setModel = useCallback((id: AlmondModelChoice) => {
    setModelState(id);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      // Non-fatal: the pick still applies for this session.
    }
  }, []);

  // Set when the durable per-user token budget is exhausted (the chat route returns 429
  // {error:"usage_limit"}). The custom transport fetch below reads that body — useChat's onError only
  // sees a message string and cannot tell a usage cap from any other error. Cleared on the next send.
  const [usageLimit, setUsageLimit] = useState<AlmondUsageLimit | null>(null);

  // One transport for the provider's life. The chosen model rides on each request's body (passed at
  // send time), so the transport itself stays static. A wrapped `fetch` intercepts the per-user
  // usage-limit 429: it reads the structured body to drive the banner, then returns the 429 unchanged
  // so useChat still settles the turn into status="error". (setUsageLimit is a stable state setter, so
  // capturing it once in this one-time initializer is safe.)
  const [transport] = useState(
    () =>
      new DefaultChatTransport<AlmondUIMessage>({
        api: "/api/almond/chat",
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (res.status === 429) {
            const data: unknown = await res
              .clone()
              .json()
              .catch(() => null);
            if (
              data !== null &&
              typeof data === "object" &&
              (data as { error?: unknown }).error === "usage_limit"
            ) {
              const d = data as { window?: unknown; resetAt?: unknown };
              setUsageLimit({
                window: d.window === "weekly" ? "weekly" : "daily",
                resetAt: typeof d.resetAt === "string" ? d.resetAt : "",
              });
            }
          }
          return res;
        },
      }),
  );

  // The navigation bridge: when the server streams a `data-navigate` part, apply it through the
  // canonical nuqs setters so the dashboard moves exactly as a manual click would (Story 7.4).
  const { apply: applyNavigation } = useAlmondNavigation();
  const [navByMessage, setNavByMessage] = useState<Map<string, AlmondNavChip[]>>(new Map());
  const [reportsByMessage, setReportsByMessage] = useState<Map<string, AlmondReportCard[]>>(new Map());
  const [metersByMessage, setMetersByMessage] = useState<Map<string, AlmondMeterCard[]>>(new Map());
  const [decidedByMessage, setDecidedByMessage] = useState<Map<string, AutoHeadlineKey>>(new Map());
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number }>({ text: "", seq: 0 });
  const pendingChips = useRef<AlmondNavChip[]>([]);
  const pendingReports = useRef<AlmondReportCard[]>([]);
  const pendingMeters = useRef<AlmondMeterCard[]>([]);
  const pendingDecided = useRef<AutoHeadlineKey | null>(null);
  const [flushTick, setFlushTick] = useState(0);

  const announce = useCallback((label: string) => {
    setAnnouncement((a) => ({ text: label, seq: a.seq + 1 }));
  }, []);

  const { messages, sendMessage, setMessages, status, regenerate } = useChat<AlmondUIMessage>({
    transport,
    // Coalesce the flood of token updates into ~50ms frames so a fast stream paints smoothly instead
    // of thrashing a re-render per token (the "choppy" output). The server also paces words via
    // smoothStream; together they read like Claude/Notion typing.
    experimental_throttle: 50,
    // `onData` fires once per received data part and is never replayed on a re-render or a reload
    // (transient parts are not persisted to history), so each navigation is applied exactly once
    // without any manual dedupe — the 7.4 "applied exactly once" guarantee is structural here.
    onData: (part) => {
      if (part.type === "data-navigate") {
        const { action, label } = part.data;
        // B1: Almond no longer auto-navigates. A `data-navigate` part renders a click-to-go chip
        // (buffered below, surfaced by AlmondActionChips) and the grower taps it to move the screen
        // (the chip's onReplay calls applyNavigation). We still buffer + announce, just never apply
        // the navigation here. This keeps the grower in the chat unless they choose to jump.
        pendingChips.current.push({ action, label });
        setFlushTick((n) => n + 1);
        announce(label);
        return;
      }
      if (part.type === "data-report") {
        pendingReports.current.push(part.data);
        setFlushTick((n) => n + 1);
        return;
      }
      if (part.type === "data-meter") {
        // B2: a light inline meter card. Buffered like the report cards and attributed to the latest
        // assistant message on the next flush tick.
        pendingMeters.current.push(part.data);
        setFlushTick((n) => n + 1);
        return;
      }
      if (part.type === "data-decided") {
        pendingDecided.current = part.data.headline;
        setFlushTick((n) => n + 1);
        return;
      }
    },
  });

  // Attribute buffered chips/cards to the assistant message that drove them, and prune any whose
  // message no longer exists (e.g. after `regenerate()` replaces a turn with a new id). Same pattern
  // as before the lift — only its home moved from the launcher to this provider.
  useEffect(() => {
    const liveIds = new Set(messages.map((m) => m.id));
    const assistantId = lastAssistantId(messages);

    const chipsToFlush = assistantId ? pendingChips.current : [];
    if (chipsToFlush.length > 0) pendingChips.current = [];
    setNavByMessage((prev) => {
      let changed = false;
      const next = new Map<string, AlmondNavChip[]>();
      for (const [id, chips] of prev) {
        if (liveIds.has(id)) next.set(id, chips);
        else changed = true;
      }
      if (chipsToFlush.length > 0 && assistantId) {
        next.set(assistantId, dedupeChips([...(next.get(assistantId) ?? []), ...chipsToFlush]));
        changed = true;
      }
      return changed ? next : prev;
    });

    const reportsToFlush = assistantId ? pendingReports.current : [];
    if (reportsToFlush.length > 0) pendingReports.current = [];
    setReportsByMessage((prev) => {
      let changed = false;
      const next = new Map<string, AlmondReportCard[]>();
      for (const [id, cards] of prev) {
        if (liveIds.has(id)) next.set(id, cards);
        else changed = true;
      }
      if (reportsToFlush.length > 0 && assistantId) {
        next.set(assistantId, dedupeReports([...(next.get(assistantId) ?? []), ...reportsToFlush]));
        changed = true;
      }
      return changed ? next : prev;
    });

    const metersToFlush = assistantId ? pendingMeters.current : [];
    if (metersToFlush.length > 0) pendingMeters.current = [];
    setMetersByMessage((prev) => {
      let changed = false;
      const next = new Map<string, AlmondMeterCard[]>();
      for (const [id, cards] of prev) {
        if (liveIds.has(id)) next.set(id, cards);
        else changed = true;
      }
      if (metersToFlush.length > 0 && assistantId) {
        next.set(assistantId, dedupeMeters([...(next.get(assistantId) ?? []), ...metersToFlush]));
        changed = true;
      }
      return changed ? next : prev;
    });

    const decidedToFlush = assistantId ? pendingDecided.current : null;
    if (decidedToFlush !== null) pendingDecided.current = null;
    setDecidedByMessage((prev) => {
      let changed = false;
      const next = new Map<string, AutoHeadlineKey>();
      for (const [id, headline] of prev) {
        if (liveIds.has(id)) next.set(id, headline);
        else changed = true;
      }
      if (decidedToFlush !== null && assistantId) {
        next.set(assistantId, decidedToFlush);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [messages, flushTick]);

  const onReplay = useCallback(
    (chip: AlmondNavChip) => {
      applyNavigation(chip.action);
      announce(chip.label);
    },
    [applyNavigation, announce],
  );

  // --- Saved history (per-user, per-farm) ----------------------------------------------------------
  // The list lives here so BOTH surfaces (panel + page) share one set of threads, exactly like the
  // conversation itself. The active thread is created lazily on its first completed turn (POST), then
  // updated in place (PUT) on later turns. Off entirely when historyEnabled is false (the Tour).
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  // Start "loading" exactly when history is enabled, so the list never flashes its empty state
  // before the first fetch lands — and so the mount effect need not call setState synchronously.
  const [historyLoading, setHistoryLoading] = useState(historyEnabled);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Refs mirror the bits the async save reads, so it never closes over a stale render's value.
  const activeConvIdRef = useRef<string | null>(null);
  const savedFingerprintRef = useRef<string>("");
  const savingRef = useRef(false);
  // Holds the messages of a turn that completed WHILE a save was in flight, so it is flushed (not
  // dropped) once the current save settles. Null when nothing is queued.
  const pendingSaveRef = useRef<AlmondUIMessage[] | null>(null);
  const prevStatusRef = useRef(status);

  // Load the grower's threads once on mount (only when history is enabled).
  useEffect(() => {
    if (!historyEnabled) return;
    let cancelled = false;
    fetch("/api/almond/conversations")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d: { conversations?: ConversationSummary[] }) => {
        if (!cancelled) setConversations(d.conversations ?? []);
      })
      .catch(() => {
        // A history fetch failure is non-fatal: the chat still works, the list just stays empty.
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyEnabled]);

  // Persist the current thread after a completed turn. Creates the row on the first save, updates it
  // in place after. A turn that completes WHILE a save is in flight is parked on pendingSaveRef and
  // drained by the loop below once the current request settles, so no turn is silently dropped even
  // when two land back-to-back (no self-recursion, which the React Compiler cannot memoize).
  const persist = useCallback(async (msgs: AlmondUIMessage[]) => {
    if (savingRef.current) {
      pendingSaveRef.current = msgs; // a save is already running; queue this turn for the drain loop
      return;
    }
    savingRef.current = true;
    try {
      let next: AlmondUIMessage[] | null = msgs;
      while (next) {
        const stored = sanitizeHistoryMessages(next);
        next = null;
        const fp = historyFingerprint(stored);
        // Skip nothing-to-save iterations (unsaveable, or unchanged from the last write).
        if (isSaveable(stored) && !(activeConvIdRef.current && fp === savedFingerprintRef.current)) {
          const headers = { "Content-Type": "application/json" };
          const body = JSON.stringify({ messages: stored });
          const id = activeConvIdRef.current;
          if (!id) {
            const res = await fetch("/api/almond/conversations", { method: "POST", headers, body });
            if (res.ok) {
              const { conversation } = (await res.json()) as { conversation: ConversationSummary };
              activeConvIdRef.current = conversation.id;
              setActiveConversationId(conversation.id);
              setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
              savedFingerprintRef.current = fp;
            }
          } else {
            const res = await fetch(`/api/almond/conversations/${id}`, { method: "PUT", headers, body });
            if (res.status === 404) {
              // The thread was deleted elsewhere: forget it so a later turn creates a fresh one.
              activeConvIdRef.current = null;
              setActiveConversationId(null);
            } else if (res.ok) {
              const { conversation } = (await res.json()) as { conversation: ConversationSummary };
              // Move the just-saved thread to the top (its updatedAt is now the newest).
              setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
              savedFingerprintRef.current = fp;
            }
          }
        }
        // Pick up a turn that completed during this iteration's request and keep draining.
        next = pendingSaveRef.current;
        pendingSaveRef.current = null;
      }
    } catch {
      // Network hiccup: leave the fingerprint unsaved so the next completed turn retries the save.
    } finally {
      savingRef.current = false;
    }
  }, []);

  // Edge-trigger: save when a turn just SETTLED (was working, now ready) and there is a real exchange.
  // Tracking the status transition (not just "ready") is what makes this fire exactly once per turn,
  // and never on a freshly loaded thread (whose status stays "ready" throughout).
  useEffect(() => {
    if (!historyEnabled) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "ready" && (prev === "streaming" || prev === "submitted")) {
      void persist(messages);
    }
  }, [status, messages, historyEnabled, persist]);

  // Reset the captured chips/cards and the lazy-save bookkeeping back to an empty thread.
  const resetConversationState = useCallback(() => {
    setNavByMessage(new Map());
    setReportsByMessage(new Map());
    setMetersByMessage(new Map());
    setDecidedByMessage(new Map());
    pendingChips.current = [];
    pendingReports.current = [];
    pendingMeters.current = [];
    pendingDecided.current = null;
    savedFingerprintRef.current = "";
  }, []);

  const newChat = useCallback(() => {
    setMessages([]);
    resetConversationState();
    activeConvIdRef.current = null;
    setActiveConversationId(null);
  }, [setMessages, resetConversationState]);

  const loadConversation = useCallback(
    (id: string) => {
      void (async () => {
        try {
          const res = await fetch(`/api/almond/conversations/${id}`);
          if (!res.ok) {
            // A stale list entry (deleted/expired): drop it so the user is not stuck on a dead row.
            if (res.status === 404) setConversations((prev) => prev.filter((c) => c.id !== id));
            return;
          }
          const { conversation } = (await res.json()) as {
            conversation: { id: string; title: string; messages: StoredMessage[] };
          };
          // The stored messages are already the text-only shape the UI renders; restore them as the
          // live thread. Transient artifacts (chips/cards) were never persisted and stay absent.
          setMessages(conversation.messages as unknown as AlmondUIMessage[]);
          resetConversationState();
          activeConvIdRef.current = conversation.id;
          setActiveConversationId(conversation.id);
          // Mark this exact state as already-saved so reopening it never triggers a redundant write.
          savedFingerprintRef.current = historyFingerprint(conversation.messages);
        } catch {
          // Non-fatal: a failed load leaves the current thread untouched.
        }
      })();
    },
    [setMessages, resetConversationState],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      // Optimistic: remove from the list now; if it was on screen, clear to a fresh thread.
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvIdRef.current === id) newChat();
      void fetch(`/api/almond/conversations/${id}`, { method: "DELETE" }).catch(() => {
        // Best-effort: a failed delete just means the row lingers server-side until the next try.
      });
    },
    [newChat],
  );

  const send = useCallback(
    (text: string, files: File[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && files.length === 0) return;
      // Dismiss any prior limit banner: a fresh send is allowed to try (if still over budget the route
      // returns 429 again and the transport re-sets it, costing only a cheap denied request).
      setUsageLimit(null);
      // The chosen model rides on the request body; the route validates it against the allowlist.
      const options = { body: { model } };
      if (files.length === 0) {
        void sendMessage({ text: trimmed }, options);
        return;
      }
      // Attachments are async (read to Data URLs) before the turn is sent.
      void filesToParts(files).then((parts) => sendMessage({ text: trimmed, files: parts }, options));
    },
    [sendMessage, model],
  );

  const retry = useCallback(() => void regenerate({ body: { model } }), [regenerate, model]);

  const editMessage = useCallback(
    (messageId: string, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      // Drop the edited user turn and everything after it (its old answer + any later turns), then
      // resend the edited text as a fresh turn so Almond answers the corrected question. setMessages
      // updates the chat synchronously, so the subsequent send appends onto the truncated history.
      setMessages(messages.slice(0, idx));
      send(trimmed);
    },
    [messages, setMessages, send],
  );

  const value = useMemo<AlmondChatValue>(
    () => ({
      open,
      setOpen,
      openAlmond,
      closeAlmond,
      farmName,
      starters,
      canAttach,
      model,
      setModel,
      messages,
      status,
      usageLimit,
      send,
      retry,
      editMessage,
      navByMessage,
      reportsByMessage,
      metersByMessage,
      decidedByMessage,
      onReplay,
      announcement,
      historyEnabled,
      conversations,
      historyLoading,
      activeConversationId,
      newChat,
      loadConversation,
      deleteConversation,
    }),
    [
      open,
      openAlmond,
      closeAlmond,
      farmName,
      starters,
      canAttach,
      model,
      setModel,
      messages,
      status,
      usageLimit,
      send,
      retry,
      editMessage,
      navByMessage,
      reportsByMessage,
      metersByMessage,
      decidedByMessage,
      onReplay,
      announcement,
      historyEnabled,
      conversations,
      historyLoading,
      activeConversationId,
      newChat,
      loadConversation,
      deleteConversation,
    ],
  );

  return <AlmondChatContext.Provider value={value}>{children}</AlmondChatContext.Provider>;
}

function useAlmondChatContext(): AlmondChatValue {
  const ctx = useContext(AlmondChatContext);
  if (ctx === null) {
    throw new Error("Almond chat hooks must be used within an AlmondChatProvider");
  }
  return ctx;
}

/** The full shared chat (messages, send, model, captured chips/cards). For the panel and the page. */
export function useAlmondChat(): AlmondChatValue {
  return useAlmondChatContext();
}

/** Back-compatible open/close subset — the rail entry, nudge, and FAB only need these. */
export function useAlmondLauncher(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  openAlmond: () => void;
  closeAlmond: () => void;
} {
  const { open, setOpen, openAlmond, closeAlmond } = useAlmondChatContext();
  return { open, setOpen, openAlmond, closeAlmond };
}

export { ZERO_WIDTH_SPACE };
