"use client";

// The real PG&E connect. On start it creates a UtilityAPI authorization form (server
// action) and opens its hosted page in a new tab, where the grower signs in to PG&E and
// picks which accounts to share. Those credentials go straight to PG&E via UtilityAPI,
// never to Terra. Unlike Bayou, UtilityAPI has no JS embed, so this is a hosted redirect
// (a real anchor the grower clicks, so the new tab opens past popup blockers). This tab
// moves to the reveal screen, which polls until the accounts, meters, and bills land.
//
// One UtilityAPI form can return MANY authorizations (one per PG&E account), so a
// multi-account operation connects in a single pass.
//
// The connect is exposed two ways:
//  - useUtilityApiConnect(): a headless hook returning { phase, error, start, modal }, so
//    the onboarding Hook's single big button can BE the trigger (the modal is rendered by
//    whoever holds the hook).
//  - UtilityApiConnect: the self-contained card, kept for the settings "connections" screen.

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui-components/react/dialog";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { startConnectionAction } from "../actions";

const c = en.onboarding.connect;
// Post-start lands on the reveal (the rebuilt flow), which polls until the data lands.
const REVEAL = "/dashboard/pump-timing/onboarding/reveal";

type Phase = "idle" | "starting" | "hosted" | "error";

export type UtilityApiConnectState = {
  phase: Phase;
  error: string | null;
  /** Begin a connection: create the form, then open the hosted authorization page. */
  start: () => void;
  /** The connect modal. Render it in your tree; it is null unless the page is open. */
  modal: ReactNode;
};

/**
 * Headless PG&E connect. Owns the form creation, the modal mount, and the route to the
 * reveal. The caller renders `modal` and wires `start` to its own button.
 */
export function useUtilityApiConnect(): UtilityApiConnectState {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hosted, setHosted] = useState<{ url: string; reveal: string } | null>(null);

  async function start() {
    setPhase("starting");
    setError(null);
    try {
      // Always start a fresh authorization so a grower can connect a different set of
      // accounts instead of being auto-signed back into the last one.
      const res = await startConnectionAction({ forceNew: true });
      if (!res.ok) {
        setPhase("error");
        setError(res.error); // the real reason (missing token, wrong environment, ...)
        return;
      }
      const { farmId, redirectUrl, alreadyAuthenticated } = res;
      const reveal = `${REVEAL}?farm=${farmId}`;

      // A reused session (Bayou fallback) needs no sign-in: go straight to the reveal.
      if (alreadyAuthenticated) return router.push(reveal);

      setHosted({ url: redirectUrl, reveal });
      setPhase("hosted");
    } catch {
      setPhase("error");
      setError(c.pgeError);
    }
  }

  function close() {
    setPhase("idle");
  }

  const modal = (
    <Dialog.Root
      open={phase === "hosted"}
      onOpenChange={(nextOpen, eventDetails) => {
        if (nextOpen) return;
        // Keep an in-progress sign-in from closing on a stray tap outside the box.
        if (eventDetails.reason === "outside-press") return;
        close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-ink/50 fixed inset-0 z-50" />
        <Dialog.Popup
          className={cn(
            "bg-bg border-line shadow-card fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border",
            "max-h-[90dvh]",
          )}
        >
          <header className="border-line flex items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="font-display text-lg">{c.pgeCta}</Dialog.Title>
            <Dialog.Close
              aria-label={c.pgeClose}
              className="text-muted hover:text-foreground -mr-1 rounded-full p-1 text-xl leading-none transition-colors"
            >
              ×
            </Dialog.Close>
          </header>

          <Dialog.Description className="text-muted border-line border-b px-5 py-3 text-xs leading-relaxed">
            {c.pgeFormHint}
          </Dialog.Description>

          {/* Hosted page: a real anchor the grower clicks. The click is a user gesture, so
              the new tab opens reliably; onClick also moves this tab to the reveal so it is
              already polling when they finish and come back. */}
          <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
            <p className="text-muted text-sm leading-relaxed text-pretty">{c.pgeHostedNote}</p>
            {hosted ? (
              <a
                href={hosted.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => router.push(hosted.reveal)}
                className="bg-green-deep hover:bg-green-hover label-caps inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-white transition-colors"
              >
                {c.pgeHostedCta} <span aria-hidden>→</span>
              </a>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return { phase, error, start, modal };
}

/**
 * The self-contained connect card (settings "connections" screen). The onboarding Hook
 * uses the headless hook directly instead of this card.
 */
export function UtilityApiConnect() {
  const { phase, error, start, modal } = useUtilityApiConnect();
  return (
    <div className="border-border bg-card rounded-2xl border p-6">
      <h2 className="font-display text-2xl">{c.pgeCta}</h2>
      <p className="text-muted mt-2 text-[0.95rem] leading-relaxed">{c.pgeNote}</p>

      <div className="mt-5">
        <button
          type="button"
          onClick={start}
          disabled={phase === "starting" || phase === "hosted"}
          className="bg-green-deep hover:bg-green-hover label-caps inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-white transition-colors disabled:opacity-60"
        >
          {phase === "starting" ? c.pgeStarting : c.pgeCta}
          {phase !== "starting" ? <span aria-hidden>→</span> : null}
        </button>
      </div>

      {error ? (
        <p className="bg-tint text-ink-soft mt-4 rounded-lg px-3 py-2 text-sm leading-relaxed">
          {error}
        </p>
      ) : null}

      {modal}
    </div>
  );
}
