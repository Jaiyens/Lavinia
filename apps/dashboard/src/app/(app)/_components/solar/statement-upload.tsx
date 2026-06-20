"use client";

// The true-up statement upload affordance (G-3, FR37/FR28/FR14). One button: clicking it opens the
// native file picker, and the moment a PDF is chosen the form self-submits (the same one-control
// pattern the onboarding upload uses, so there is no separate "now press upload" step). The PDF
// routes through the role-gated `uploadTrueUpStatementAction`, which feeds the SAME fail-closed
// extract pipeline (the PDF never touches the client beyond the form post, NFR10). On an exact match
// the dollar surfaces flip from honest-blank to settled and the page revalidates; an unmatched or
// unreadable statement leaves every dollar honest-blank with a calm needs-review note, never a guess.
//
// Role-gated: rendered ONLY when `canAttach` (owner/manager); a viewer never sees it. Honors
// prefers-reduced-motion (no entrance animation; the settle highlight is the page-level flip).

import { useActionState, useRef, useState } from "react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { uploadTrueUpStatementAction, type StatementUploadState } from "../../actions";

const t = en.solar.statementUpload;

export function StatementUpload({
  /** A spelled-out header card (the Solar-tab affordance) vs a compact inline button (a calendar
   *  entry or the drawer). Both post to the same role-gated action. */
  variant = "card",
}: {
  variant?: "card" | "inline";
}) {
  const [state, formAction, pending] = useActionState<StatementUploadState, FormData>(
    uploadTrueUpStatementAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      name="statement"
      accept="application/pdf,.pdf"
      className="sr-only"
      onChange={(e) => {
        const files = e.target.files;
        if (!files || files.length === 0) {
          setChosen(null);
          return;
        }
        setChosen(files[0]?.name ?? null);
        formRef.current?.requestSubmit();
      }}
    />
  );

  const button = (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={pending}
      className={cn(
        "press inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-outline-variant px-4 text-[0.9375rem] font-semibold text-on-surface transition-colors",
        "hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending ? (
        <>
          <Spinner /> {t.uploading}
        </>
      ) : (
        <>
          <UploadIcon /> {t.cta}
        </>
      )}
    </button>
  );

  // The settled / needs-review / chosen feedback line, read as content by assistive tech (aria-live)
  // so the flip from honest-blank is announced, never a silent state change.
  const feedback = (
    <p
      aria-live="polite"
      className={cn(
        "type-caption",
        state.error ? "font-medium text-alert" : "text-on-surface-variant",
      )}
    >
      {state.error
        ? state.error
        : state.settled
          ? t.settled
          : chosen && !pending
            ? t.chosen(chosen)
            : ""}
    </p>
  );

  if (variant === "inline") {
    return (
      <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
        {fileInput}
        {button}
        {feedback}
      </form>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-outline-variant bg-surface-container-low p-5"
    >
      {fileInput}
      <div className="flex flex-col gap-1">
        <h3 className="type-title text-on-surface">{t.title}</h3>
        <p className="type-caption text-on-surface-variant">{t.body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{button}</div>
      <p className="type-caption text-on-surface-variant/70">{t.hint}</p>
      {feedback}
    </form>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 [animation:terra-spin_0.7s_linear_infinite]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
