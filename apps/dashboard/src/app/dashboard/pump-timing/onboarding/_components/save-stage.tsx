"use client";

// Screen 5, the save. The only fields are name and email, no password. Submits to
// saveOwnerAction, which writes one owner Person and lands on the home screen. The
// connection is already active and the engines have already run, so this is purely the
// "who are you" step.

import { useFormStatus } from "react-dom";
import { en } from "@/copy/en";
import { saveOwnerAction } from "../actions";

function SaveButton() {
  const { pending } = useFormStatus();
  const r = en.onboarding.reveal;
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-green-deep hover:bg-green-hover label-caps inline-flex items-center gap-2 rounded-full px-8 py-4 text-white transition-colors disabled:opacity-60"
    >
      {pending ? r.saving : r.saveCta}
      {!pending ? <span aria-hidden>→</span> : null}
    </button>
  );
}

export function SaveStage({ farmId }: { farmId: string }) {
  const r = en.onboarding.reveal;
  return (
    <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-6">
      <h2 className="font-display text-3xl leading-tight text-balance">{r.saveTitle}</h2>
      <p className="text-muted mt-3 leading-relaxed text-pretty">{r.saveNote}</p>

      <form action={saveOwnerAction} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="farmId" value={farmId} />
        <label className="flex flex-col gap-1.5">
          <span className="label-caps text-muted">{r.nameLabel}</span>
          <input
            name="name"
            required
            autoComplete="name"
            placeholder={r.namePlaceholder}
            className="border-border bg-surface focus:border-border-strong rounded-lg border px-3 py-2.5 outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps text-muted">{r.emailLabel}</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={r.emailPlaceholder}
            className="border-border bg-surface focus:border-border-strong rounded-lg border px-3 py-2.5 outline-none"
          />
        </label>
        <div className="mt-2">
          <SaveButton />
        </div>
      </form>
    </div>
  );
}
