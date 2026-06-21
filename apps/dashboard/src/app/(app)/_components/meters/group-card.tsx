"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import { byUrgency, type MeterGroup } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";
import { MeterTile } from "./meter-tile";

// A GROUP container: collapsible, with a spare header - the worst-meter risk dot, the group name,
// its meter count, and the ONE dollar figure that matters (demand locked so far). A group is
// organizational, never a billing unit, so it never shows a pooled kW.
//
// Normal view shows clean gauge tiles only. Regrouping (rename + move/merge/split) lives behind an
// EDIT MODE toggled by the pencil on the header, so the board reads like a dashboard, not a form.

const m = en.meters;

export function GroupCard({
  group,
  allGroupNames,
  now,
  onOpenMeter,
  onMoveMeter,
  onRenameGroup,
}: {
  group: MeterGroup;
  allGroupNames: string[];
  now: Date;
  onOpenMeter: (meterId: string) => void;
  onMoveMeter: (meterId: string, toGroup: string) => void;
  onRenameGroup: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(group.worst !== "safe");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const style = RISK_STYLE[group.worst];
  // Meters sort most-at-risk first, so the eye lands on the problem meter (top-left).
  const ordered = byUrgency(group.risks);
  const lockedCents = centsFromDollars(group.totalLockedDemandUsd);

  const toggleEdit = () => {
    setEditing((e) => {
      const next = !e;
      if (next) {
        setDraftName(group.name);
        setOpen(true); // editing reveals the tiles + move controls
      }
      return next;
    });
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low">
      {/* Header: collapse toggle, worst-meter dot, name, meter count, demand-so-far dollar, edit. */}
      <div className="flex items-center gap-3 p-3.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? m.group.collapse : m.group.expand}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
          )}
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: style.dot }} />
          {editing ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
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
              className="min-w-0 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-2 py-1 type-body-md text-on-surface"
            />
          ) : (
            <span className="truncate type-title text-on-surface">{group.name}</span>
          )}
          <span className="shrink-0 type-caption text-on-surface-variant">
            {m.group.meterCount(group.risks.length)}
          </span>
        </button>

        <span className="shrink-0 type-num font-semibold tabular-nums text-on-surface">
          {formatUsdWhole(lockedCents)}
        </span>
        <button
          type="button"
          aria-label={editing ? m.group.doneEditing : m.group.edit}
          aria-pressed={editing}
          onClick={toggleEdit}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors",
            editing
              ? "bg-primary-container text-primary"
              : "text-on-surface-variant hover:bg-surface-container",
          )}
        >
          {editing ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-2.5 border-t border-outline-variant p-3.5 sm:grid-cols-2">
          {ordered.map((risk) => (
            <div key={risk.meter.id} className="flex flex-col gap-1.5">
              <MeterTile
                risk={risk}
                groupName={group.name}
                now={now}
                onOpen={() => onOpenMeter(risk.meter.id)}
              />
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
      )}
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
