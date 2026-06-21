"use client";

import { useEffect, useMemo, useState } from "react";
import { en } from "@/copy/en";
import {
  buildBoardSummary,
  buildGroups,
  groupNames,
  type GroupOverrides,
  type MetersFeedResult,
} from "@/lib/meters";
import { TopTile } from "./top-tile";
import { GroupCard } from "./group-card";
import { MeterDetail } from "./meter-detail";

// The Meters board: the client orchestrator. It pulls the representative feed (the V2 seam:
// swap this one line for a live feed later), assesses every meter PER METER, groups them
// dynamically, and persists the farmer's manual grouping corrections in localStorage so they
// survive re-renders and later uploads (mirrors how the Home bento order persists). The board
// itself never pools demand: every kW shown is one meter's own; groups show only dollars + counts.
//
// Layout: a minimal header, then a two-column board - the meter groups (main) and a slim side rail
// with the "Most urgent" + "Today's read" stat cards. The page scrolls naturally; nothing is locked
// to one screen, so all content stays reachable on any height.

const m = en.meters;

// Manual grouping corrections persist here, keyed like the bento order key. New meters slot into
// existing groups automatically (resolveGroupName runs every render); only meters the farmer
// explicitly moved carry an override, so a re-upload never wipes manual fixes.
const STORAGE_KEY = "terra.meters.group.overrides.v1";

function loadOverrides(): GroupOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    const out: GroupOverrides = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveOverrides(next: GroupOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

export function MetersBoard({ feed, now: nowProp }: { feed: MetersFeedResult; now: string }) {
  // A stable reference clock for this render. The server page passes the real now (ISO) + the
  // already-pulled feed (the rate card is read server-side); we never call Date.now() or read the
  // card during render, so SSR and first client render agree and nothing fs-bound runs in the browser.
  const now = useMemo(() => new Date(nowProp), [nowProp]);
  const summary = useMemo(() => buildBoardSummary(feed, now), [feed, now]);

  // Overrides start empty (matches SSR), then hydrate from localStorage after mount.
  const [overrides, setOverrides] = useState<GroupOverrides>({});
  useEffect(() => {
    const saved = loadOverrides();
    if (Object.keys(saved).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOverrides(saved);
    }
  }, []);

  const [openMeterId, setOpenMeterId] = useState<string | null>(null);

  const groups = useMemo(() => buildGroups(feed.meters, overrides), [feed.meters, overrides]);
  const allNames = useMemo(() => groupNames(groups), [groups]);

  const moveMeter = (meterId: string, toGroup: string) => {
    setOverrides((cur) => {
      const next = { ...cur, [meterId]: toGroup };
      saveOverrides(next);
      return next;
    });
  };

  const renameGroup = (from: string, to: string) => {
    const target = to.trim();
    if (target.length === 0 || target === from) return;
    // Renaming pins every meter currently in `from` to the new name via an explicit override,
    // so the rename survives re-uploads exactly like a move (the inferred name no longer wins).
    setOverrides((cur) => {
      const next = { ...cur };
      for (const g of groups) {
        if (g.name !== from) continue;
        for (const r of g.risks) next[r.meter.id] = target;
      }
      saveOverrides(next);
      return next;
    });
  };

  const resetGroups = () => {
    setOverrides({});
    saveOverrides({});
  };

  const openRisk = useMemo(
    () => summary.risks.find((r) => r.meter.id === openMeterId) ?? null,
    [summary.risks, openMeterId],
  );
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 lg:px-12">
      {/* Header: title + the representative-data marking + the freshness line (the ~1-day lag). */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-display-lg text-on-surface">{m.title}</h1>
          <time dateTime={summary.asOfIso} className="mt-1 block type-caption text-on-surface-variant">
            {m.asOf(summary.asOfPhrase)}
          </time>
        </div>
        <div className="flex items-center gap-3">
          {hasOverrides && (
            <button
              type="button"
              onClick={resetGroups}
              title={m.group.resetGroupsHint}
              className="type-caption text-on-surface-variant underline-offset-2 hover:underline"
            >
              {m.group.resetGroups}
            </button>
          )}
          {summary.representative && (
            <span className="rounded-full bg-surface-container px-2.5 py-1 type-label-caps text-on-surface-variant">
              {m.representativeTag}
            </span>
          )}
        </div>
      </header>

      {/* Two-column board: the side rail (Most urgent + Today's read) and the meter groups.
          On narrow screens the rail stacks above the groups. */}
      <div className="flex flex-col gap-5 lg:flex-row-reverse lg:items-start">
        <div className="lg:sticky lg:top-6 lg:w-72 lg:shrink-0">
          <TopTile summary={summary} onOpenUrgent={setOpenMeterId} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {groups.map((group) => (
            <GroupCard
              key={group.name}
              group={group}
              allGroupNames={allNames}
              onOpenMeter={setOpenMeterId}
              onMoveMeter={moveMeter}
              onRenameGroup={renameGroup}
            />
          ))}
        </div>
      </div>

      {openRisk !== null && (
        <MeterDetail risk={openRisk} now={now} onClose={() => setOpenMeterId(null)} />
      )}
    </div>
  );
}
