"use client";

import { History, SquarePen, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { useAlmondChat } from "./almond-launcher-provider";

const t = en.shell.almond;

// Almond's saved-history surface: a per-user list of past chats plus a "New chat" affordance. The
// data + actions all come from the shared chat context (one source of threads across the panel and
// the page); these are the presentation pieces, composed differently per surface:
//   - the /almond page mounts AlmondHistorySidebar (a persistent left rail on lg+),
//   - the floating panel + the page-on-mobile mount AlmondHistorySheet (an overlay over the body).
// All of it renders nothing when history is disabled (the public Tour), so the Tour is unchanged.

/** A short, client-only relative time for a thread's last activity (no SSR, so Date.now is safe). */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The "New chat" control: an icon button, optionally with its label (for the sidebar header). */
export function AlmondNewChatButton({
  withLabel = false,
  onAction,
  className,
}: {
  withLabel?: boolean;
  onAction?: () => void;
  className?: string;
}) {
  const { newChat } = useAlmondChat();
  return (
    <button
      type="button"
      onClick={() => {
        newChat();
        onAction?.();
      }}
      aria-label={t.newChatAria}
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:text-primary",
        withLabel
          ? "w-full border border-outline-variant bg-surface-container-lowest px-3 py-2 type-body-md font-medium hover:border-primary"
          : "grid h-9 w-9 place-items-center hover:bg-tint",
        className,
      )}
    >
      <SquarePen size={withLabel ? 16 : 18} aria-hidden className="shrink-0" />
      {withLabel && <span>{t.newChat}</span>}
    </button>
  );
}

/** The scrollable list of a grower's saved threads. Loading + empty states are handled inline. */
export function AlmondHistoryList({
  onPick,
  className,
}: {
  /** Called after a thread is chosen (e.g. to close an overlay). */
  onPick?: () => void;
  className?: string;
}) {
  const { conversations, historyLoading, activeConversationId, loadConversation, deleteConversation } =
    useAlmondChat();

  if (historyLoading && conversations.length === 0) {
    return <p className={cn("px-3 py-2 type-body-sm text-on-surface-variant", className)}>{t.historyLoading}</p>;
  }
  if (conversations.length === 0) {
    return <p className={cn("px-3 py-2 type-body-sm text-on-surface-variant", className)}>{t.historyEmpty}</p>;
  }

  return (
    <ul className={cn("flex flex-col gap-0.5", className)}>
      {conversations.map((c) => {
        const active = c.id === activeConversationId;
        return (
          <li key={c.id} className="group/item relative">
            <button
              type="button"
              onClick={() => {
                loadConversation(c.id);
                onPick?.();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-control)] py-2 pl-3 pr-9 text-left transition-colors",
                active
                  ? "bg-primary/[0.08] text-primary"
                  : "text-on-surface hover:bg-tint",
              )}
            >
              <span className="min-w-0 flex-1 truncate type-body-md">{c.title}</span>
              <span className="shrink-0 type-label-caps text-on-surface-variant">{relTime(c.updatedAt)}</span>
            </button>
            <button
              type="button"
              onClick={() => deleteConversation(c.id)}
              aria-label={t.deleteChatAria(c.title)}
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[var(--radius-control)] text-on-surface-variant opacity-0 transition-opacity hover:bg-risk/10 hover:text-risk focus-visible:opacity-100 group-hover/item:opacity-100"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The page's persistent history rail (desktop only). Mirrors a ChatGPT/Claude-style left column. */
export function AlmondHistorySidebar() {
  const { historyEnabled } = useAlmondChat();
  if (!historyEnabled) return null;
  return (
    <aside
      aria-label={t.historyAria}
      className="hidden w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest/60 lg:flex lg:sticky lg:top-0 lg:h-[calc(100dvh-4rem)] lg:self-start"
    >
      <div className="p-3">
        <AlmondNewChatButton withLabel />
      </div>
      <p className="eyebrow px-4 pb-1 text-on-surface-variant">{t.chatsHeading}</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <AlmondHistoryList />
      </div>
    </aside>
  );
}

/**
 * An overlay listing saved threads, used where a persistent rail does not fit (the floating panel,
 * and the page on mobile). Positioned to fill its nearest positioned ancestor by default; pass a
 * `className` to anchor it differently (e.g. a fixed sheet).
 */
export function AlmondHistorySheet({
  open,
  onClose,
  className,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
}) {
  const { historyEnabled } = useAlmondChat();
  if (!historyEnabled || !open) return null;
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col bg-surface-container-lowest",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-outline-variant px-3 py-2.5">
        <p className="flex-1 type-body-md font-semibold text-on-surface">{t.chatsHeading}</p>
        <AlmondNewChatButton onAction={onClose} />
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeHistory}
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-on-surface-variant hover:bg-tint"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        <AlmondHistoryList onPick={onClose} />
      </div>
    </div>
  );
}

/** A compact "History" toggle button (icon), for surfaces that open the sheet on demand. */
export function AlmondHistoryButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const { historyEnabled } = useAlmondChat();
  if (!historyEnabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.historyAria}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:bg-tint hover:text-primary",
        className,
      )}
    >
      <History size={18} aria-hidden />
    </button>
  );
}
