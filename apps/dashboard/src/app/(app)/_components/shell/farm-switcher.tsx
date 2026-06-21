"use client";

// The farm switcher under the wordmark. A user who belongs to more than one farm picks which one
// the whole shell shows; the choice is written to the validated active-farm cookie via
// setActiveFarmAction and the shell re-renders. With a single farm it is just a static label (no
// dropdown), so the common case stays quiet.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { setActiveFarmAction } from "../../actions";

type FarmOption = { id: string; name: string };

export function FarmSwitcher({
  farms,
  activeFarmId,
}: {
  farms: FarmOption[];
  activeFarmId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = farms.find((f) => f.id === activeFarmId) ?? farms[0] ?? null;
  if (!active) return null;

  // Single farm: a plain label (no interactive switcher), plus a quiet "Add a farm" link so a
  // one-farm user can still start or join another without first growing a dropdown.
  if (farms.length <= 1) {
    return (
      <div className="px-3 pb-4">
        <p className="truncate type-body-sm font-semibold text-on-surface" title={active.name}>
          {active.name}
        </p>
        <Link
          href="/start?add=1"
          className="mt-1 inline-flex items-center gap-1 type-caption text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <Plus size={13} aria-hidden />
          {en.team.addFarm}
        </Link>
      </div>
    );
  }

  function select(id: string) {
    setOpen(false);
    if (id === active?.id) return;
    startTransition(async () => {
      await setActiveFarmAction(id);
      router.refresh();
    });
  }

  return (
    <div className="relative px-2.5 pb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-surface-container-low disabled:opacity-60"
      >
        <span
          className="min-w-0 flex-1 truncate type-body-sm font-semibold text-on-surface"
          title={active.name}
        >
          {active.name}
        </span>
        <ChevronsUpDown size={15} aria-hidden className="shrink-0 text-on-surface-variant" />
      </button>
      {open ? (
        <>
          {/* Click-away scrim (transparent) so an outside click closes the menu. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="listbox"
            className="absolute left-2.5 right-2.5 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-[var(--shadow-soft)]"
          >
            <p className="px-3 py-1.5 type-label-caps text-on-surface-variant/70">
              {en.team.switcherHeading}
            </p>
            {farms.map((f) => (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={f.id === active.id}
                onClick={() => select(f.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left type-body-sm transition-colors hover:bg-surface-container-low",
                  f.id === active.id ? "font-semibold text-primary" : "text-on-surface",
                )}
              >
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                {f.id === active.id ? (
                  <Check size={15} aria-hidden className="shrink-0 text-primary" />
                ) : null}
              </button>
            ))}
            {/* Start or join ANOTHER farm. /start?add=1 always shows the Create-vs-Join fork. */}
            <div className="my-1 h-px bg-outline-variant" />
            <Link
              href="/start?add=1"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left type-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              <Plus size={15} aria-hidden className="shrink-0" />
              <span>{en.team.addFarm}</span>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
