"use client";

import { Download, FileText } from "lucide-react";
import { en } from "@/copy/en";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { AlmondAvatar } from "./almond-avatar";
import type { AlmondGenerationData } from "@/lib/almond/responder";
import type { AlmondGeneration } from "./use-almond-generations";

/**
 * The inline card for a background-built file (Almond v2 Phase 2). A model-authored spreadsheet/PDF
 * can take a minute, so it no longer builds inside the chat turn; Almond enqueues it (the build runs in
 * the chat route's `after()`, surviving the grower leaving the page) and the chat tracks it by jobId.
 *
 * ONE card, THREE faces, driven by the LIVE polled status (joined from `useAlmondGenerations` by
 * jobId), not the emit-time "pending" on the handle:
 *   - building (pending | running, or no poll row yet): a calm "I'll keep working, you can leave" line
 *     under a thinking mascot, so a closed tab never feels like a dead box.
 *   - done: SWAP in place to a download card whose link hits the existing owner-scoped report download
 *     route (/api/reports/[resultReportId]/download) by id. A plain anchor with `download` — the route
 *     forces an attachment with the server-authored filename, so no inline bytes are needed here.
 *   - failed: a short, honest line offering a re-ask. Never a crash, never a partial download.
 *
 * Cool-grey palette; the building face reuses the chat's thinking-ring mascot (reduced-motion-safe via
 * globals.css), the done/failed faces are static (nothing to degrade).
 */

const t = en.shell.almond.generation;
const cardT = en.shell.almond.export.skill.card;

// A clean PDF/document red for the finished-file icon, matching the download card's PDF accent. Literal
// so the document reads at a glance without a new palette token.
const FILE_RED = "#D33A2C";

export function AlmondGenerationCard({
  handle,
  live,
}: {
  /** The per-turn handle (jobId + the grower's request words for the label). */
  handle: AlmondGenerationData;
  /** The latest polled row for this job (by jobId), or undefined before the first poll lands. */
  live: AlmondGeneration | undefined;
}) {
  // The live status wins; before the first poll (or a dropped row) we fall back to the emit-time
  // "pending" on the handle, so the card always starts as a building card, never a blank.
  const status = live?.status ?? handle.status;
  const requestText = handle.requestText.trim() || cardT.download;

  // A terminal "done" with no resultReportId is a broken invariant (the runner sets both together), and a
  // "failed" row is an honest failure. Both render the same calm, honest face rather than spinning the
  // building card forever.
  if (status === "failed" || (status === "done" && !live?.resultReportId)) {
    return (
      <div
        role="group"
        aria-label={t.failedTitle}
        className="mt-2 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low px-3.5 py-3"
      >
        <p className="type-body-md font-medium text-risk">{t.failedTitle}</p>
        <p className="mt-0.5 type-body-sm text-on-surface-variant">{t.failedNote}</p>
      </div>
    );
  }

  if (status === "done" && live?.resultReportId) {
    // SWAP to the download card. A plain anchor by report id to the existing owner-scoped route, which
    // forces the attachment with the server-authored filename (no inline bytes, no client decode).
    return (
      <div
        role="group"
        aria-label={t.readyTitle}
        className="mt-2 flex items-center gap-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low px-3.5 py-3"
      >
        <FileText size={22} aria-hidden className="shrink-0" style={{ color: FILE_RED }} />
        <div className="min-w-0 flex-1">
          <p className="type-body-md font-medium text-on-surface">{t.readyTitle}</p>
          <p className="type-body-sm truncate text-on-surface-variant">{requestText}</p>
        </div>
        <a
          href={`/api/reports/${live.resultReportId}/download`}
          download
          aria-label={t.downloadAria(requestText)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 type-label-caps text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ borderColor: "color-mix(in srgb, var(--color-primary) 40%, transparent)" }}
        >
          <Download size={14} aria-hidden />
          <span>{t.download}</span>
        </a>
      </div>
    );
  }

  // building (pending | running, or no poll row yet).
  return (
    <div
      role="group"
      aria-label={t.buildingAria(requestText)}
      className="mt-2 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low px-3.5 py-3"
    >
      <div className="flex items-center gap-2.5">
        <BuildingMascot />
        <div className="min-w-0 flex-1">
          <AnimatedShinyText className="type-body-md font-medium text-on-surface">
            {t.buildingTitle}
          </AnimatedShinyText>
          <p className="type-body-sm truncate text-on-surface-variant">{requestText}</p>
        </div>
      </div>
      <p className="mt-1.5 type-body-sm text-on-surface-variant">{t.buildingNote}</p>
    </div>
  );
}

/** The mascot inside the chat's spinning thinking ring (green -> gold), left static under reduced
 *  motion (globals.css `.almond-thinking-ring`). Mirrors the chat's WorkingLine treatment. */
function BuildingMascot() {
  const size = 24;
  const ring = size + 10;
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: ring, height: ring }}
    >
      <span aria-hidden className="almond-thinking-ring absolute inset-0 rounded-full" />
      <AlmondAvatar size={size} state="thinking" />
    </span>
  );
}
