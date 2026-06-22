"use client";

import { useMemo, useState } from "react";
import { en } from "@/copy/en";
import { buildBoardSummary, byUrgency, type MetersFeedResult } from "@/lib/meters";
import { TopTile } from "./top-tile";
import { MeterTile } from "./meter-tile";
import { MeterDetail } from "./meter-detail";

// The Meters board: the client orchestrator. It pulls the representative feed (the V2 seam: swap
// this one line for a live feed later) and assesses every meter PER METER. The board itself never
// pools demand: every kW shown is one meter's own.
//
// Layout: a minimal header, the two answer-first squares (Most urgent + Today's read) centered on
// top, then EVERY meter as a square gauge tile in one flat grid - no groups, no collapse, all on
// one screen. Meters are ordered most-at-risk first so the eye lands on the problem.

const m = en.meters;

export function MetersBoard({ feed, now: nowProp }: { feed: MetersFeedResult; now: string }) {
  // A stable reference clock for this render. The server page passes the real now (ISO) + the
  // already-pulled feed (the rate card is read server-side); we never call Date.now() or read the
  // card during render, so SSR and first client render agree and nothing fs-bound runs in the browser.
  const now = useMemo(() => new Date(nowProp), [nowProp]);
  const summary = useMemo(() => buildBoardSummary(feed, now), [feed, now]);
  const meters = useMemo(() => byUrgency(summary.risks), [summary.risks]);

  const [openMeterId, setOpenMeterId] = useState<string | null>(null);
  const openRisk = useMemo(
    () => summary.risks.find((r) => r.meter.id === openMeterId) ?? null,
    [summary.risks, openMeterId],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-5 lg:px-12">
      {/* Header: title + the representative-data marking + the freshness line (the ~1-day lag). */}
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-display-lg text-on-surface">{m.title}</h1>
          <time dateTime={summary.asOfIso} className="mt-1 block type-caption text-on-surface-variant">
            {m.asOf(summary.asOfPhrase)}
          </time>
        </div>
        {summary.representative && (
          <span className="rounded-full bg-surface-container px-2.5 py-1 type-label-caps text-on-surface-variant">
            {m.representativeTag}
          </span>
        )}
      </header>

      {/* Most urgent + Today's read, centered at the top. */}
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        <TopTile summary={summary} onOpenUrgent={setOpenMeterId} />
      </div>

      {/* Every meter, flat (no grouping), all on one screen, centered. Most-at-risk first. */}
      <div className="flex flex-wrap justify-center gap-2.5">
        {meters.map((risk) => (
          <div key={risk.meter.id} className="w-40 sm:w-44">
            <MeterTile risk={risk} groupName="" onOpen={() => setOpenMeterId(risk.meter.id)} />
          </div>
        ))}
      </div>

      {openRisk !== null && (
        <MeterDetail risk={openRisk} now={now} onClose={() => setOpenMeterId(null)} />
      )}
    </div>
  );
}
