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
import type { AlmondReportData } from "@/lib/almond/responder";
import { DEFAULT_ALMOND_MODEL, isAllowedModel, type AlmondModelId } from "@/lib/almond/models";
import type { AlmondNavChip } from "./almond-result";
import type { AlmondReportCard } from "./almond-download-card";
import { useAlmondNavigation } from "./use-almond-navigation";

// The ONE Almond conversation, lifted to a context so BOTH surfaces share it: the floating panel
// (quick-ask from any screen) and the dedicated /almond full-page tab. Previously this provider held
// only the open/close boolean and the conversation lived inside AlmondLauncher; promoting the whole
// chat here is what lets the panel and the page show the same thread, the same model choice, and the
// same captured action-chips / download-cards. No global state lib — one typed context with a few
// known consumers. Must render under the nuqs adapter (the navigation bridge uses useQueryState).

/**
 * Almond's chat carries two custom transient stream parts:
 *   - `data-navigate` (Story 7.5): a navigation `action` plus a plain-English `label` for the chip.
 *   - `data-report` (Story 8.5): a file Almond made (base64 bytes + file name), rendered as a
 *     download card. Transient, so the bytes are delivered once and never replayed or persisted.
 */
export type AlmondUIMessage = UIMessage<
  unknown,
  { navigate: { action: NavigateAction; label: string }; report: AlmondReportData }
>;

type AlmondChatStatus = "submitted" | "streaming" | "ready" | "error";

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
  model: AlmondModelId;
  setModel: (id: AlmondModelId) => void;
  // The conversation, shared by the panel and the page.
  messages: AlmondUIMessage[];
  status: AlmondChatStatus;
  /** Send a turn with optional file attachments (PDF / Excel / CSV). */
  send: (text: string, files?: File[]) => void;
  retry: () => void;
  /** Re-ask an earlier user turn with edited text: drop that turn and everything after it, then
   *  resend. Powers the per-message Edit control. */
  editMessage: (messageId: string, newText: string) => void;
  navByMessage: Map<string, AlmondNavChip[]>;
  reportsByMessage: Map<string, AlmondReportCard[]>;
  onReplay: (chip: AlmondNavChip) => void;
  announcement: { text: string; seq: number };
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
  children,
}: {
  farmName: string;
  starters: string[];
  canAttach: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openAlmond = useCallback(() => setOpen(true), []);
  const closeAlmond = useCallback(() => setOpen(false), []);

  // Chosen model. Starts at the default for an SSR-safe first render, then hydrates from
  // localStorage so a grower's pick sticks between visits (a farmer specifically liked switching).
  const [model, setModelState] = useState<AlmondModelId>(DEFAULT_ALMOND_MODEL);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      // One-time hydration of the persisted pick after mount. setState-in-effect is the correct
      // pattern here (localStorage can't be read during SSR/render without a hydration mismatch);
      // SSR and the first client render both show the default, then this syncs the saved choice.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isAllowedModel(saved)) setModelState(saved);
    } catch {
      // localStorage may be unavailable (privacy mode) — the default is fine.
    }
  }, []);
  const setModel = useCallback((id: AlmondModelId) => {
    setModelState(id);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      // Non-fatal: the pick still applies for this session.
    }
  }, []);

  // One transport for the provider's life. The chosen model rides on each request's body (passed at
  // send time), so the transport itself stays static.
  const [transport] = useState(() => new DefaultChatTransport<AlmondUIMessage>({ api: "/api/almond/chat" }));

  // The navigation bridge: when the server streams a `data-navigate` part, apply it through the
  // canonical nuqs setters so the dashboard moves exactly as a manual click would (Story 7.4).
  const { apply: applyNavigation } = useAlmondNavigation();
  const [navByMessage, setNavByMessage] = useState<Map<string, AlmondNavChip[]>>(new Map());
  const [reportsByMessage, setReportsByMessage] = useState<Map<string, AlmondReportCard[]>>(new Map());
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number }>({ text: "", seq: 0 });
  const pendingChips = useRef<AlmondNavChip[]>([]);
  const pendingReports = useRef<AlmondReportCard[]>([]);
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
        applyNavigation(action); // one-shot apply (Story 7.4)
        pendingChips.current.push({ action, label });
        setFlushTick((n) => n + 1);
        announce(label);
        return;
      }
      if (part.type === "data-report") {
        pendingReports.current.push(part.data);
        setFlushTick((n) => n + 1);
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
  }, [messages, flushTick]);

  const onReplay = useCallback(
    (chip: AlmondNavChip) => {
      applyNavigation(chip.action);
      announce(chip.label);
    },
    [applyNavigation, announce],
  );

  const send = useCallback(
    (text: string, files: File[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && files.length === 0) return;
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
      send,
      retry,
      editMessage,
      navByMessage,
      reportsByMessage,
      onReplay,
      announcement,
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
      send,
      retry,
      editMessage,
      navByMessage,
      reportsByMessage,
      onReplay,
      announcement,
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
