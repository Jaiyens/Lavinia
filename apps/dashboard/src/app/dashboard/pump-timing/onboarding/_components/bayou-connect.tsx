"use client";

// The real PG&E connect. On start it creates a Bayou customer (server action) and
// opens Bayou's onboarding form in a centered modal (Plaid-style), where the grower
// types their PG&E login and MFA code. Those credentials go straight to Bayou, never
// to Terra. When the utility accepts the login, Bayou fires customerHasAuthenticated
// and we move to the reveal screen, which polls until the accounts, meters, and bills
// land.
//
// The connect is exposed two ways:
//  - useBayouConnect(): a headless hook returning { phase, error, start, modal }, so the
//    onboarding Hook's single big button can BE the trigger (the modal is rendered by
//    whoever holds the hook).
//  - BayouConnect: the self-contained card, kept for the settings "connections" screen.
//
// The embed needs a public company id (NEXT_PUBLIC_BAYOU_COMPANY_ID, from the Bayou
// dashboard, matching BAYOU_DOMAIN's environment). Without it, or if the embed script
// fails, we fall back to Bayou's hosted page in a new tab and still land on the reveal.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui-components/react/dialog";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { startBayouAction } from "../actions";

const c = en.onboarding.connect;
// Post-auth lands on the reveal (the rebuilt flow), not the old step-list pending screen.
const PENDING = "/dashboard/pump-timing/onboarding/reveal";
const COMPANY_ID = process.env.NEXT_PUBLIC_BAYOU_COMPANY_ID;
const BAYOU_SCRIPT = "https://js.bayou.energy/v1";

type BayouEvent = { type: string; result?: string };

type BayouSdk = {
  loadOnboardingForm: (
    element: HTMLElement,
    companyId: string,
    onboardingToken: string,
    callback: (event: BayouEvent) => void,
  ) => void;
};

declare global {
  interface Window {
    Bayou?: BayouSdk;
  }
}

/** Load Bayou's embed script once, resolving with the global it installs. */
function loadBayouSdk(): Promise<BayouSdk> {
  return new Promise((resolve, reject) => {
    if (window.Bayou) return resolve(window.Bayou);
    const settle = () =>
      window.Bayou ? resolve(window.Bayou) : reject(new Error("bayou-load-failed"));
    const fail = () => reject(new Error("bayou-load-failed"));
    const existing = document.querySelector<HTMLScriptElement>("script[data-bayou]");
    if (existing) {
      existing.addEventListener("load", settle);
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.src = BAYOU_SCRIPT;
    script.async = true;
    script.dataset.bayou = "true";
    script.addEventListener("load", settle);
    script.addEventListener("error", fail);
    document.head.appendChild(script);
  });
}

/** The embed widget is production-only; the onboarding link's host tells us which
 * environment we are in (bayou.energy = prod, staging.bayou.energy = sandbox). The prod
 * widget cannot resolve a staging company/token, so on staging we use the hosted page. */
function isProdLink(link: string): boolean {
  try {
    return !/(^|\.)staging\./i.test(new URL(link).hostname);
  } catch {
    return false; // unparseable: prefer the hosted page over a widget that will hang
  }
}

// "form" = the embedded widget (prod). "hosted" = a link to Bayou's hosted page (staging,
// or when the embed is unavailable). Both render the modal.
type Phase = "idle" | "starting" | "form" | "hosted" | "error";

export type BayouConnectState = {
  phase: Phase;
  error: string | null;
  /** Begin a connection: create the customer, then open the modal (or hosted page). */
  start: () => void;
  /** The connect modal. Render it in your tree; it is null unless the form is open. */
  modal: ReactNode;
};

/**
 * Headless PG&E connect. Owns the SDK load, the modal mount, the
 * customerHasAuthenticated handler, and the hosted-page fallback. The caller renders
 * `modal` and wires `start` to its own button.
 */
export function useBayouConnect(): BayouConnectState {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<BayouSdk | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  // Which token the embed has already been mounted for, so the mount effect runs once
  // per connect even under React's double-invoked dev effects.
  const mountedTokenRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Escape hatch: open Bayou's hosted page and move to the reveal if the inline form
  // does not render.
  const [hosted, setHosted] = useState<{ link: string; pending: string } | null>(null);

  // Mount the Bayou form into the modal once it is on screen (phase === "form").
  useEffect(() => {
    if (phase !== "form" || !COMPANY_ID) return;
    const el = formRef.current;
    const sdk = sdkRef.current;
    const token = tokenRef.current;
    if (!el || !sdk || !token || mountedTokenRef.current === token) return;
    mountedTokenRef.current = token;
    sdk.loadOnboardingForm(el, COMPANY_ID, token, (event) => {
      // customerHasAuthenticated (not an auth error) is the current completion event;
      // bayouCustomerFinishedOnboarding is the deprecated one, accepted as a backup.
      const done =
        (event.type === "customerHasAuthenticated" &&
          event.result !== "authentication_error") ||
        event.type === "bayouCustomerFinishedOnboarding";
      if (done && pendingRef.current) router.push(pendingRef.current);
    });
  }, [phase, router]);

  // Base UI's Dialog locks background scroll while it is open, so no manual lock here.

  async function start() {
    setPhase("starting");
    setError(null);
    try {
      // Always start a fresh sign-in so a grower can connect a different PG&E account
      // instead of being auto-signed back into the last authenticated one.
      const res = await startBayouAction({ forceNew: true });
      if (!res.ok) {
        setPhase("error");
        setError(res.error); // the real reason (bad key, wrong environment, ...)
        return;
      }
      const { farmId, onboardingToken, onboardingLink, alreadyAuthenticated } = res;
      const pending = `${PENDING}?farm=${farmId}`;
      pendingRef.current = pending;
      setHosted({ link: onboardingLink, pending });

      // This account already has a valid PG&E session (reused from a prior connect), so
      // there is nothing to sign in to: skip the form and go straight to the reveal.
      if (alreadyAuthenticated) return router.push(pending);

      // The embedded widget (js.bayou.energy/v1) is production-only. On the staging
      // sandbox the prod widget cannot resolve a staging company/token and spins forever,
      // so there (and when no embed company id is set) we show Bayou's hosted page as a
      // link the grower clicks.
      if (!COMPANY_ID || !isProdLink(onboardingLink)) {
        setPhase("hosted");
        return;
      }

      let sdk: BayouSdk;
      try {
        sdk = await loadBayouSdk();
      } catch {
        setPhase("hosted"); // SDK failed to load: fall back to the hosted page
        return;
      }
      sdkRef.current = sdk;
      tokenRef.current = onboardingToken;
      setPhase("form"); // the mount effect renders the embed into the modal
    } catch {
      setPhase("error");
      setError(c.pgeError);
    }
  }

  function close() {
    mountedTokenRef.current = null;
    if (formRef.current) formRef.current.innerHTML = "";
    setPhase("idle");
  }

  const open = phase === "form" || phase === "hosted";
  const modal = (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (nextOpen) return;
        // Keep an in-progress PG&E sign-in from closing on a stray tap outside the box.
        // Escape and the close button (handled by the primitive) still dismiss.
        if (eventDetails.reason === "outside-press") return;
        close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-ink/50 fixed inset-0 z-50" />
        <Dialog.Popup
          className={cn(
            "bg-bg border-line shadow-card fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border",
            phase === "form" ? "h-[680px] max-h-[90dvh]" : "max-h-[90dvh]",
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

          {phase === "form" ? (
            <>
              {/* Bayou mounts its PG&E login + MFA form here (filled by the effect). */}
              <div ref={formRef} className="min-h-0 flex-1 overflow-auto bg-surface" />

              {hosted ? (
                <footer className="border-line border-t px-5 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      window.open(hosted.link, "_blank", "noopener");
                      router.push(hosted.pending);
                    }}
                    className="text-faint hover:text-foreground text-xs transition-colors"
                  >
                    {c.pgeOpenHosted}
                  </button>
                </footer>
              ) : null}
            </>
          ) : (
            // Hosted path (staging / no embed): a real anchor the grower clicks. The click
            // is a user gesture, so the new tab opens reliably; onClick also moves this tab
            // to the reveal so it is already polling when they finish and come back.
            <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
              <p className="text-muted text-sm leading-relaxed text-pretty">{c.pgeHostedNote}</p>
              {hosted ? (
                <a
                  href={hosted.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => router.push(hosted.pending)}
                  className="bg-green-deep hover:bg-green-hover label-caps inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-white transition-colors"
                >
                  {c.pgeHostedCta} <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>
          )}
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
export function BayouConnect() {
  const { phase, error, start, modal } = useBayouConnect();
  return (
    <div className="border-border bg-card rounded-2xl border p-6">
      <h2 className="font-display text-2xl">{c.pgeCta}</h2>
      <p className="text-muted mt-2 text-[0.95rem] leading-relaxed">{c.pgeNote}</p>

      <div className="mt-5">
        <button
          type="button"
          onClick={start}
          disabled={phase === "starting" || phase === "form" || phase === "hosted"}
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
