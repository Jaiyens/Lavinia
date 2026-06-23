"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The client tracker for Almond's background-built files (Almond v2 Phase 2). A model-authored
 * spreadsheet/PDF no longer builds inside the chat turn (a ~30-90s build would die the moment the
 * grower left the page); it is ENQUEUED as a GenerationJob and built in the chat route's `after()`,
 * surviving the grower leaving. This hook polls the farm-scoped status endpoint
 * (GET /api/almond/generations) so the chat can swap a "building" card to a "download" card when a
 * job finishes, and so a RED unread badge can light up when a build completes while the grower is
 * away.
 *
 * POLLING LIFECYCLE (no idle hammering):
 *   - Poll ONCE on mount, so a job that finished while the grower was off the page is caught the
 *     moment the shell loads (the unread badge then lights without any chat open).
 *   - While there is an in-flight (pending|running) job OR the panel is open, poll every ~2.5s.
 *   - Stop the interval the moment nothing is in-flight AND the panel is closed.
 * The 401 (anonymous) / 404 (no active farm) the endpoint returns are non-fatal: the list simply
 * stays empty, exactly as it does for the public Tour (which cannot poll its own background builds,
 * matching the download route's gating).
 *
 * UNREAD: a job that flips to "done" while the panel is CLOSED increments `unreadCount` (a small red
 * badge). Opening the panel clears it (`markSeen`). A job already "done" on the FIRST poll is treated
 * as already-seen (it is history the grower may have downloaded last session), so a returning grower
 * is not greeted by a stale red badge.
 */

/** One generation job row, as the status endpoint serializes it (Dates become ISO strings on the
 *  wire). Mirrors the GenerationJob select in /api/almond/generations. */
export type AlmondGeneration = {
  id: string;
  /** "workbook" | "report" — typed loosely (a string off the wire) and narrowed where it matters. */
  kind: string;
  /** "pending" | "running" | "done" | "failed". */
  status: string;
  requestText: string;
  /** Set when status === "done": the GeneratedReport id to download via /api/reports/[id]/download. */
  resultReportId: string | null;
  /** Set when status === "failed". */
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

/** A terminal job has either finished building or failed; it is no longer in flight. */
function isTerminal(status: string): boolean {
  return status === "done" || status === "failed";
}

/** A job still building (or queued to build): the tracker keeps polling while any job is here. */
function isInFlight(status: string): boolean {
  return status === "pending" || status === "running";
}

const POLL_MS = 2500;

/** Narrow an unknown JSON body to the jobs array, defensively (a malformed body yields []). */
function parseJobs(body: unknown): AlmondGeneration[] {
  if (typeof body !== "object" || body === null) return [];
  const jobs = (body as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.filter(
    (j): j is AlmondGeneration =>
      typeof j === "object" &&
      j !== null &&
      typeof (j as { id?: unknown }).id === "string" &&
      typeof (j as { status?: unknown }).status === "string",
  );
}

export type UseAlmondGenerations = {
  /** The farm's recent jobs, newest first (max 12), as last polled. */
  generations: AlmondGeneration[];
  /** Count of finished ("done") files the grower has not yet seen. Drives the RED unread badge on
   *  both the launcher and the rail Almond icon. */
  unreadCount: number;
  /** Clear the unread badge: every currently-"done" job is marked seen. Called when the panel opens. */
  markSeen: () => void;
};

/**
 * Track the farm's background generations. `panelOpen` is the live Almond panel/page open state from
 * the chat context: an open panel keeps the poll warm (so a building card flips to a download card in
 * place) and clears the unread badge; a closed panel + no in-flight job lets the poll go idle.
 */
export function useAlmondGenerations(panelOpen: boolean): UseAlmondGenerations {
  const [generations, setGenerations] = useState<AlmondGeneration[]>([]);
  // Ids the grower has already "seen" (downloaded/closed last session, or viewed in an open panel).
  // A done job whose id is here never counts toward the unread badge.
  const seenRef = useRef<Set<string>>(new Set());
  // Whether the very first poll has landed: the first batch of already-"done" jobs is seeded as seen
  // (history, not a fresh completion), so a returning grower never sees a stale red badge.
  const seededRef = useRef(false);
  // The latest panelOpen, read inside the poll without re-subscribing the interval each toggle.
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const [unreadCount, setUnreadCount] = useState(0);

  // Recompute the unread count from the current rows + the seen set. A done job not yet seen counts.
  const recomputeUnread = useCallback((rows: AlmondGeneration[]) => {
    let count = 0;
    for (const job of rows) {
      if (job.status === "done" && !seenRef.current.has(job.id)) count += 1;
    }
    setUnreadCount(count);
  }, []);

  const markSeen = useCallback(() => {
    setGenerations((rows) => {
      for (const job of rows) {
        if (job.status === "done") seenRef.current.add(job.id);
      }
      return rows;
    });
    setUnreadCount(0);
  }, []);

  // One fetch of the status endpoint, folded into state. 401/404/network errors are swallowed (the
  // list stays as it was). On the FIRST successful poll, every already-"done" job is seeded as seen
  // so it is history, not a fresh completion.
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/almond/generations", { cache: "no-store" });
      if (!res.ok) return; // 401 anonymous / 404 no farm: nothing to track.
      const body: unknown = await res.json();
      const rows = parseJobs(body);
      if (!seededRef.current) {
        for (const job of rows) {
          if (isTerminal(job.status)) seenRef.current.add(job.id);
        }
        seededRef.current = true;
      } else if (panelOpenRef.current) {
        // The panel is open as a completion lands: the grower is looking at it, so mark it seen now
        // (the building card swaps to a download card in place). No red badge for a build the grower
        // is actively watching.
        for (const job of rows) {
          if (job.status === "done") seenRef.current.add(job.id);
        }
      }
      setGenerations(rows);
      recomputeUnread(rows);
    } catch {
      // Non-fatal: a failed poll leaves the last-known list in place.
    }
  }, [recomputeUnread]);

  // Mount poll: catch a build that finished while the grower was away (badge lights with no chat open).
  useEffect(() => {
    void poll();
  }, [poll]);

  // The interval, kept alive only while it is needed: any in-flight job, or an open panel (so an
  // in-place card swap stays live). Re-subscribed when the in-flight signal or panelOpen changes, so
  // it stops the instant nothing is in flight and the panel is closed (no idle hammering).
  const anyInFlight = generations.some((j) => isInFlight(j.status));
  useEffect(() => {
    if (!anyInFlight && !panelOpen) return;
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [anyInFlight, panelOpen, poll]);

  // Opening the panel clears the unread badge (the grower is now looking at the chat).
  useEffect(() => {
    if (panelOpen) markSeen();
  }, [panelOpen, markSeen]);

  return { generations, unreadCount, markSeen };
}
