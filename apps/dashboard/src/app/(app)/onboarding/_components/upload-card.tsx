"use client";

// A self-contained file upload that behaves the way every other site does: ONE button.
// Clicking it opens the native file picker; the moment a file is chosen the form submits
// itself, so there is no separate "now press upload" step (the bug the old two-control
// card had, where the button submitted an empty form). Shows the chosen filename, a
// pending label while the server reads it, the accepted format, and any error inline.

import { useActionState, useRef, useState, type ReactNode } from "react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { cardClass } from "@/components/ui";
import type { ConnectState } from "../actions";

const t = en.connect.picker;

export function UploadCard({
  farmId,
  title,
  body,
  hint,
  accept,
  name,
  cta,
  action,
  icon,
  multiple = false,
}: {
  farmId: string;
  title: string;
  body: string;
  hint: string;
  accept: string;
  name: string;
  cta: string;
  action: (prev: ConnectState, fd: FormData) => Promise<ConnectState>;
  icon: ReactNode;
  multiple?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <form ref={formRef} action={formAction} className={cardClass({ className: "flex flex-col gap-4 p-5" })}>
      <input type="hidden" name="farmId" value={farmId} />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
          {icon}
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="type-title">{title}</h3>
          <p className="type-caption text-on-surface-variant">{body}</p>
        </div>
      </div>

      {/* Visually hidden but kept in the DOM and triggered by the button below, so the one
          control is the button. The label-less input never shows the browser's ugly
          "No file chosen" default. */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) {
            setChosen(null);
            return;
          }
          setChosen(files.length > 1 ? `${files.length} files` : files[0]!.name);
          formRef.current?.requestSubmit();
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
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
              <UploadIcon /> {cta}
            </>
          )}
        </button>
        {chosen && !pending ? (
          <span className="type-caption text-on-surface-variant">{t.chosen(chosen)}</span>
        ) : null}
      </div>

      <p className="type-caption text-on-surface-variant/70">{hint}</p>
      {state.error ? <p className="type-caption font-medium text-alert">{state.error}</p> : null}
    </form>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 [animation:terra-spin_0.7s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
