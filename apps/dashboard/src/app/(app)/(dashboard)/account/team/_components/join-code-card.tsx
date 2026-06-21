"use client";

// The shareable join-code card (Phase 2): an admin reveals (lazily generates) a per-farm code, then
// shares the code or a /join?code= link out of band. Possessing the code lets someone ASK to join;
// access still requires an explicit approval. "Make a new code" rotates it, invalidating old links.

import { useState, useTransition } from "react";
import { en } from "@/copy/en";
import { getOrCreateJoinCodeAction, rotateJoinCodeAction } from "../actions";

export function JoinCodeCard({
  farmId,
  initialCode,
}: {
  farmId: string;
  initialCode: string | null;
}) {
  const t = en.team.joinCode;
  const [code, setCode] = useState<string | null>(initialCode);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reveal(): void {
    setError(null);
    start(async () => {
      const res = await getOrCreateJoinCodeAction(farmId);
      if (!res.ok) setError(res.error);
      else setCode(res.code);
    });
  }

  function rotate(): void {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await rotateJoinCodeAction(farmId);
      if (!res.ok) setError(res.error);
      else setCode(res.code);
    });
  }

  function copyLink(): void {
    if (!code) return;
    const link = `${window.location.origin}/join?code=${code}`;
    void navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
      <h2 className="type-label-caps mb-1 text-on-surface-variant">{t.heading}</h2>
      <p className="mb-4 type-body-sm text-on-surface-variant">{t.body}</p>
      {code ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <div className="min-w-0">
              <p className="type-label-caps text-on-surface-variant/70">{t.codeLabel}</p>
              <p className="select-all font-mono text-lg font-semibold tracking-[0.18em] text-on-surface">
                {code}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={copyLink}
              className="type-body-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline"
            >
              {copied ? t.copied : t.copyLink}
            </button>
            <button
              type="button"
              onClick={rotate}
              disabled={pending}
              className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline disabled:opacity-50"
            >
              {t.rotate}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={reveal}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container px-4 py-2 type-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
        >
          {t.show}
        </button>
      )}
      {error ? <p className="mt-3 type-body-sm text-alert">{error}</p> : null}
    </section>
  );
}
