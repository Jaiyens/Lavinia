"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { formatUsdWhole, centsFromDollars } from "@/lib/format/money";
import { byUrgency, type MeterGroup } from "@/lib/meters";
import { RISK_STYLE } from "./risk-style";
import { MeterTile } from "./meter-tile";

// A GROUP container: collapsible, showing the group's DOLLAR roll-ups + at-risk count + its
// WORST-meter risk indicator. It deliberately shows NO group kW / distance-to-peak (a group is
// organizational, never a billing unit; demand is per meter). The header lets the farmer rename
// the group and each tile lets them move a meter to another group; both corrections persist.

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
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const style = RISK_STYLE[group.worst];
  const ordered = byUrgency(group.risks);
  const lockedCents = centsFromDollars(group.totalLockedDemandUsd);
  const crossCents = centsFromDollars(group.totalCrossPeakCostUsd);

  return (
    <section className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-low shadow-e1">
      {/* Header: collapse toggle, worst-meter indicator, at-risk count, dollar roll-ups. */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? m.group.collapse : m.group.expand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
          )}
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: style.dot }}
          />
          {renaming ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenameGroup(group.name, draftName);
                  setRenaming(false);
                }
                if (e.key === "Escape") {
                  setDraftName(group.name);
                  setRenaming(false);
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

        <span
          className="rounded-full px-2.5 py-1 type-label-caps"
          style={{ background: style.bg, color: style.text }}
        >
          {m.group.atRiskCount(group.atRiskCount)}
        </span>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="type-caption text-on-surface-variant">{m.group.lockedDemand}</p>
            <p className="type-num font-semibold tabular-nums text-on-surface">
              {formatUsdWhole(lockedCents)}
            </p>
          </div>
          {group.atRiskCount > 0 && (
            <div className="text-right">
              <p className="type-caption text-on-surface-variant">{m.group.crossExposure}</p>
              <p className="type-num font-semibold tabular-nums" style={{ color: RISK_STYLE.danger.text }}>
                {formatUsdWhole(crossCents)}
              </p>
            </div>
          )}
          <button
            type="button"
            aria-label={m.group.rename}
            onClick={() => {
              setDraftName(group.name);
              setRenaming(true);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-outline-variant p-4 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.map((risk) => (
            <div key={risk.meter.id} className="flex flex-col gap-1.5">
              <MeterTile risk={risk} now={now} onOpen={() => onOpenMeter(risk.meter.id)} />
              <MoveControl
                current={group.name}
                allGroupNames={allGroupNames}
                onMove={(to) => onMoveMeter(risk.meter.id, to)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The per-meter "move to group" control: pick an existing group or type a new one. The
 *  correction is handed up to the board, which persists it in localStorage. */
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="type-caption text-on-surface-variant">{en.meters.group.moveMeter}:</span>
      <select
        aria-label={en.meters.group.moveTo}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new__") setAdding(true);
          else if (v.length > 0) onMove(v);
        }}
        className={cn(
          "rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-2 py-1 type-caption text-on-surface",
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
