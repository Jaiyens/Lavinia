"use client";

// A one-time, honest note about a PARTIAL live PG&E connect (an account that was not shared, a
// meter that came in without usage history, a meter that could not be saved). The connecting
// screen stashes the note in sessionStorage when the import returns degradation tallies; this
// reads it on the confirm step, shows it once, then clears it so a refresh does not repeat it.
// Client-only (sessionStorage), rendered after a successful pull, never blocks the flow.

import { useEffect, useState } from "react";

export function PartialConnectNote({ farmId }: { farmId: string }) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorage is client-only (unavailable during SSR), so read on mount. The read +
    // setState is deferred off the synchronous effect body (a 0ms timer) so it is not a
    // cascading-render in the effect body; clear the key after reading so a refresh does not
    // repeat the note.
    const id = window.setTimeout(() => {
      try {
        const key = `pge-note-${farmId}`;
        const stashed = sessionStorage.getItem(key);
        if (stashed) {
          setNote(stashed);
          sessionStorage.removeItem(key);
        }
      } catch {
        // sessionStorage can throw in private mode; there is simply no note to show.
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [farmId]);

  if (!note) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container px-4 py-3"
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      </span>
      <p className="type-body-sm text-on-surface-variant">{note}</p>
    </div>
  );
}
