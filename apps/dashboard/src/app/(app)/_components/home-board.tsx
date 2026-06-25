"use client";

import { useState } from "react";
import { CalendarDays, Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Button, Card } from "@/components/ui";
import { BentoGrid, type BentoItem } from "./bento-grid";

// The home board: the header (greeting + date + the "Edit tabs" lock toggle) and the bento grid.
// Edit mode is OFF by default so a grower never moves a tile by accident; the lock toggle in the
// top right turns drag-to-rearrange on (and the icon shows the state).
export function HomeBoard({
  greeting,
  dateStr,
  items,
}: {
  greeting: string;
  dateStr: string;
  items: BentoItem[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-title text-on-surface">{greeting}</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className={cn(
              editing && "border-primary bg-primary-container text-on-primary-container hover:bg-primary-container",
            )}
          >
            {editing ? <LockOpen size={15} aria-hidden /> : <Lock size={15} aria-hidden />}
            {en.home.editLayout}
          </Button>
          <Card asChild className="flex-row items-center gap-2 px-3 py-1.5">
            <div aria-hidden>
            <CalendarDays size={16} className="text-on-surface-variant" />
            <span className="type-caption tnum text-on-surface">{dateStr}</span>
            </div>
          </Card>
        </div>
      </header>

      <BentoGrid items={items} editing={editing} />
    </>
  );
}
