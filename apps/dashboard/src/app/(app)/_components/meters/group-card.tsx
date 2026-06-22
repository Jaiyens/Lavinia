"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import { byUrgency, type MeterGroup } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";
import { MeterTile } from "./meter-tile";

// A GROUP section on the dashboard: a slim header (worst-meter dot, name, meter count, demand-so-far
// dollar, edit pencil) with ALL its meters shown beneath as gauge tiles. There is no collapse - it
// is a dashboard, so every meter is on screen at once; the farmer never clicks to reveal a group.
// A group is organizational, never a billing unit, so it shows a summed dollar roll-up, never a kW.
//
// Regrouping (rename + move/merge/split) lives behind an EDIT MODE toggled by the pencil, so normal
// viewing stays clean.

const m = en.meters;

export function GroupCard({
  group,
  allGroupNames,
  onOpenMeter,
  onMoveMeter,
  onRenameGroup,
}: {
  group: MeterGroup;
  allGroupNames: string[];
  onOpenMeter: (meterId: string) => void;
  onMoveMeter: (meterId: string, toGroup: string) => void;
  onRenameGroup: (from: string, to: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const style = RISK_STYLE[group.worst];
  // Meters sort most-at-risk first, so the eye lands on the problem meter (top-left).
  const ordered = byUrgency(group.risks);
  const lockedCents = centsFromDollars(group.totalLockedDemandUsd);

  return (
    <section className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low">
      {/* Slim header: worst-meter dot, name, meter count, demand-so-far dollar, edit. */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: style.dot }} />
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRenameGroup(group.name, draftName);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setDraftName(group.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-2 py-1 type-body-md text-on-surface"
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate type-title text-on-surface">{group.name}</h2>
        )}
        <span className="shrink-0 type-caption text-on-surface-variant">
          {m.group.meterCount(group.risks.length)}
        </span>
        <span className="shrink-0 type-num font-semibold tabular-nums text-on-surface">
          {formatUsdWhole(lockedCents)}
        </span>
        <button
          type="button"
          aria-label={editing ? m.group.doneEditing : m.group.edit}
          aria-pressed={editing}
          onClick={() => {
            if (!editing) setDraftName(group.name);
            setEditing((e) => !e);
          }}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors",
            editing ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container",
          )}
        >
          {editing ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>

      {/* Every meter, always visible, as square tiles. */}
      <div className="grid grid-cols-2 gap-2 border-t border-outline-variant p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {ordered.map((risk) => (
          <div key={risk.meter.id} className="flex flex-col gap-1.5">
            <MeterTile risk={risk} groupName={group.name} onOpen={() => onOpenMeter(risk.meter.id)} />
            {editing && (
              <MoveControl
                current={group.name}
                allGroupNames={allGroupNames}
                onMove={(to) => onMoveMeter(risk.meter.id, to)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The per-meter "move to group" control (edit mode only): pick an existing group or type a new one.
 *  The correction is handed up to the board, which persists it in localStorage. */
function MoveControl({
  current,
  allGroupNames,
  onMove,
}: {
  current: string;
  allGroupNames: string[];
  onMove: (to: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const others = allGroupNames.filter((n) => n !== current);

  if (adding) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={en.meters.group.newGroup}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim().length > 0) {
              onMove(draft.trim());
              setAdding(false);
              setDraft("");
            }
            if (e.key === "Escape") setAdding(false);
          }}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-2 py-1 type-caption text-on-surface"
        />
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="type-caption text-on-surface-variant hover:text-on-surface"
        >
          {en.meters.group.cancel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 pl-1">
      <select
        aria-label={en.meters.group.moveTo}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new__") setAdding(true);
          else if (v.length > 0) onMove(v);
        }}
        className={cn(
          "rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-2 py-0.5 type-caption text-on-surface-variant",
        )}
      >
        <option value="" disabled>
          {en.meters.group.moveTo}
        </option>
        {others.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__new__">+ {en.meters.group.newGroup}</option>
      </select>
    </div>
  );
}
