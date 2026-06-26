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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui";
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
    <Card className="flex flex-col gap-3 rounded-2xl p-5">
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
            <Button
              asChild
              variant="primary"
              className="min-h-[44px] w-full gap-2 rounded-[var(--radius-control)] px-4 type-body-md font-semibold"
            >
              <a href={downloadHref}>
                <Download size={16} aria-hidden />
                {t.download}
              </a>
            </Button>
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
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={onApprove}
                aria-label={t.approveAria(view.pumpName, view.month)}
                className="min-h-[44px] flex-1 gap-2 rounded-[var(--radius-control)] px-4 type-body-md font-semibold"
              >
                <Check size={16} aria-hidden />
                {t.approve}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onSkip}
                aria-label={t.rejectAria(view.pumpName, view.month)}
                className="min-h-[44px] gap-2 rounded-[var(--radius-control)] border-outline-variant px-4 type-body-md text-on-surface hover:bg-surface-container-low"
              >
                <X size={16} aria-hidden />
                {t.reject}
              </Button>
            </div>
          )}
        </>
      )}

      {error !== null && (
        <p role="alert" className="type-body-sm text-alert">
          {error}
        </p>
      )}
    </Card>
  );
}
