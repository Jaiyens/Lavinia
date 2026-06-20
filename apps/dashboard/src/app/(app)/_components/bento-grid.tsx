"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";

// The home BENTO grid, drag-to-rearrange. Each widget is rendered server-side and handed in as a
// node; this client shell lets the grower drag widgets into any order with a small grip handle
// (so the widget's own controls stay fully interactive), and remembers the layout in localStorage.
// The grid spans/sizes are unchanged - only the ORDER changes, so the one-screen layout holds.

export type BentoItem = { id: string; className?: string; node: ReactNode };

const STORAGE_KEY = "terra.home.bento.order.v2";

function SortableCell({
  id,
  className,
  editing,
  children,
}: {
  id: string;
  className?: string;
  editing: boolean;
  children: ReactNode;
}) {
  // Drag is disabled unless edit mode is on, so a tile is never moved by accident.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/cell relative min-h-0",
        editing && "rounded-[var(--radius-lg)] outline-2 outline-dashed outline-primary/40",
        isDragging && "z-50 opacity-80",
        className,
      )}
    >
      {children}
      {/* Drag handle: shown only in edit mode, so the widget's own buttons stay clickable normally. */}
      {editing && (
        <button
          type="button"
          aria-label="Drag to rearrange"
          className="absolute left-2 top-2 z-40 flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md border border-outline-variant bg-surface-container-lowest text-on-surface shadow-e2 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function BentoGrid({ items, editing }: { items: BentoItem[]; editing: boolean }) {
  const defaultOrder = items.map((i) => i.id);
  const [order, setOrder] = useState<string[]>(defaultOrder);

  // Load the saved layout after mount (keeps SSR == first client render, then reconciles).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const known = new Set(defaultOrder);
      const kept = saved.filter((id): id is string => typeof id === "string" && known.has(id));
      const missing = defaultOrder.filter((id) => !kept.includes(id));
      // Hydrate the saved layout after mount: first client render matches the server (default
      // order), then we reconcile to the grower's saved order. setState-in-effect is intended here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrder([...kept, ...missing]);
    } catch {
      // ignore malformed storage
    }
    // defaultOrder is derived from items; re-run only when the set of ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOrder.join(",")]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter((i): i is BentoItem => i !== undefined);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over === null || active.id === over.id) return;
    setOrder((cur) => {
      const from = cur.indexOf(String(active.id));
      const to = cur.indexOf(String(over.id));
      if (from < 0 || to < 0) return cur;
      const next = arrayMove(cur, from, to);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures (private mode, quota)
      }
      return next;
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-6 lg:grid-rows-4">
          {ordered.map((it) => (
            <SortableCell key={it.id} id={it.id} className={it.className} editing={editing}>
              {it.node}
            </SortableCell>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
