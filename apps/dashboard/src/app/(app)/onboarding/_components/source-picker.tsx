"use client";

import Link from "next/link";
import { useState } from "react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import {
  connectSampleAction,
  uploadBillAction,
  uploadGreenButtonAction,
  uploadSpreadsheetAction,
} from "../actions";
import { PgeCard } from "./pge-card";
import { UploadCard } from "./upload-card";

const t = en.connect.picker;

// The source picker. PG&E is the primary, recommended source (a real hosted authorization
// pull). Uploading a bill is the equal alternative for a grower without a PG&E login handy;
// the bulk paths (Green Button export, meter list) sit under a quiet "more ways" expander so
// the screen stays calm. "Continue to review" stays disabled until a real source lands.
export function SourcePicker({
  farmId,
  total,
  hasInventory,
  canContinue,
}: {
  farmId: string;
  total: number;
  hasInventory: boolean;
  canContinue: boolean;
}) {
  const [showMore, setShowMore] = useState(false);
  const status = canContinue
    ? t.statusReady(total)
    : hasInventory
      ? t.statusInventory(total)
      : t.statusNone;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
        <h1 className="type-display-lg">{t.title}</h1>
        <p className="type-body-md text-on-surface-variant">{t.intro}</p>
      </div>

      <div className="flex flex-col gap-4">
        <PgeCard farmId={farmId} />

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-outline-variant" />
          <span className="type-caption text-on-surface-variant">or</span>
          <span className="h-px flex-1 bg-outline-variant" />
        </div>

        <UploadCard
          farmId={farmId}
          title={t.billsTitle}
          body={t.billsBody}
          hint={t.billsHint}
          accept="image/*,application/pdf"
          name="bill"
          cta={t.billsCta}
          action={uploadBillAction}
          icon={<BillIcon />}
        />

        {showMore ? (
          <>
            <UploadCard
              farmId={farmId}
              title={t.greenButtonTitle}
              body={t.greenButtonBody}
              hint={t.greenButtonHint}
              accept=".xml,text/xml,application/xml"
              name="files"
              cta={t.greenButtonCta}
              action={uploadGreenButtonAction}
              icon={<FileIcon />}
              multiple
            />
            <UploadCard
              farmId={farmId}
              title={t.sheetTitle}
              body={t.sheetBody}
              hint={t.sheetHint}
              accept=".csv,text/csv"
              name="sheet"
              cta={t.sheetCta}
              action={uploadSpreadsheetAction}
              icon={<SheetIcon />}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="press inline-flex items-center justify-center gap-1.5 self-center rounded-full px-4 py-2 type-caption font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
          >
            {t.moreWays} <ChevronIcon />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-outline-variant pt-6">
        <p
          className={cn(
            "type-body-md",
            canContinue ? "font-semibold text-primary" : "text-on-surface-variant",
          )}
        >
          {status}
        </p>
        {canContinue ? (
          <Link
            href={`/onboarding/confirm?farm=${farmId}`}
            className="press inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary/90"
          >
            {t.continue}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-[var(--radius-control)] bg-primary/40 px-6 font-semibold text-on-primary"
          >
            {t.continue}
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Quiet demo path so a grower with nothing handy can still walk the flow. */}
          <form action={connectSampleAction}>
            <input type="hidden" name="farmId" value={farmId} />
            <button
              type="submit"
              className="type-caption text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
            >
              {t.sampleCta}
            </button>
          </form>
          <Link
            href="/onboarding?new=1"
            className="type-caption text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
          >
            {t.differentFarm}
          </Link>
        </div>
      </div>
    </div>
  );
}

function BillIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
