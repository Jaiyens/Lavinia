"use client";

// The bill-dispute Home card: shown beside a flagged bill-audit finding. It surfaces what the
// bill-dispute agent proposed (a drafted PG&E dispute letter) and offers the OWNER a one-tap
// "Approve and prepare dispute packet" plus a "Not now" skip. The card is a client component so
// the owner acts without a full reload; it posts ONLY the serializable action id to the server
// actions (never a function, never a farmId), which re-check ownership server-side — the client
// is never trusted. While a transition is pending both controls disable so a double-tap cannot
// double-fire (the server's atomic status guard is the real backstop). Mobile-first: >= 44px
// tap targets.
//
// readOnly (the public Tour): the controls are replaced by a sample note, so a visitor can see
// the agent's shape but cannot approve a real dispute. NEVER calls PG&E.

import { useState, useTransition } from "react";
import { FileText, Check, X, Download } from "lucide-react";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import {
  approveAndPrepareDisputeAction,
  skipDisputeAction,
} from "./bill-dispute-actions";

const t = en.agents.billDispute.card;

/** The serializable view of a proposed/approved bill-dispute action the Server Component passes
 *  in. No functions, no farmId, no secrets — just what the card renders and the id it posts. */
export type BillDisputeCardView = {
  /** The AgentAction id (the only token posted to the server actions). */
  agentActionId: string;
  /** The action status (proposed -> the owner can act; executed/approved -> packet path). */
  status: "proposed" | "approved" | "rejected" | "executed" | "failed";
  /** The meter name for the heading (server-resolved, never a cuid). */
  pumpName: string;
  /** The flagged cycle's month name (e.g. "May"). */
  month: string;
  /** The engine-authored dollar excess for the calm body line. */
  excessUsd: number;
  /** The owner-scoped download href for the prepared packet, when one exists (executed). */
  downloadHref: string | null;
};

export function BillDisputeCard({
  view,
  readOnly = false,
}: {
  view: BillDisputeCardView;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The packet href can arrive from the approve action's result without a full reload.
  const [downloadHref, setDownloadHref] = useState<string | null>(view.downloadHref);
  // Local optimistic status so the card flips to the ready/skipped state on success.
  const [status, setStatus] = useState(view.status);

  const isResolved = status === "executed" || status === "approved";
  const isSkipped = status === "rejected";

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveAndPrepareDisputeAction(view.agentActionId);
      if (res.ok) {
        setStatus("executed");
        setDownloadHref(`/api/reports/${encodeURIComponent(res.data.reportId)}/download`);
      } else {
        setError(res.error);
      }
    });
  }

  function onSkip() {
    setError(null);
    startTransition(async () => {
      const res = await skipDisputeAction(view.agentActionId);
      if (res.ok) setStatus("rejected");
      else setError(res.error);
    });
  }

  return (
    <div className={cardClass({ radius: "2xl", className: "flex flex-col gap-3 p-5" })}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
          <FileText size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="type-label-caps text-primary">{t.eyebrow}</p>
          <p className="truncate type-title text-on-surface">
            {isResolved ? t.readyHeading : t.heading(view.pumpName, view.month)}
          </p>
        </div>
      </div>

      {isResolved ? (
        <>
          <p className="type-body-md text-on-surface-variant">{t.readyBody}</p>
          {downloadHref !== null && (
            <a
              href={downloadHref}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 type-body-md font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Download size={16} aria-hidden />
              {t.download}
            </a>
          )}
        </>
      ) : isSkipped ? (
        <p className="type-body-md text-on-surface-variant">{t.skipped}</p>
      ) : (
        <>
          <p className="type-body-md text-on-surface-variant">{t.proposedBody(view.excessUsd)}</p>
          {readOnly ? (
            <p className="type-body-sm text-on-surface-variant">{t.readOnlyNote}</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={pending}
                onClick={onApprove}
                aria-label={t.approveAria(view.pumpName, view.month)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 type-body-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Check size={16} aria-hidden />
                {t.approve}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onSkip}
                aria-label={t.rejectAria(view.pumpName, view.month)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X size={16} aria-hidden />
                {t.reject}
              </button>
            </div>
          )}
        </>
      )}

      {error !== null && (
        <p role="alert" className="type-body-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
