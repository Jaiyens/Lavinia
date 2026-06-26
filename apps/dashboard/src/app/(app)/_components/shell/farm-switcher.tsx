"use client";

// The farm switcher under the wordmark. A user who belongs to more than one farm picks which one
// the whole shell shows; the choice is written to the validated active-farm cookie via
// setActiveFarmAction and the shell re-renders. With a single farm it is just a static label (no
// dropdown), so the common case stays quiet.

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import { en } from "@/copy/en";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveFarmAction } from "../../actions";

type FarmOption = { id: string; name: string };

export function FarmSwitcher({
  farms,
  activeFarmId,
}: {
  farms: FarmOption[];
  activeFarmId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const active = farms.find((f) => f.id === activeFarmId) ?? farms[0] ?? null;
  if (!active) return null;

  // Single farm: a plain label (no interactive switcher), plus a quiet "Add a farm" link so a
  // one-farm user can still start or join another without first growing a dropdown.
  if (farms.length <= 1) {
    return (
      <div className="px-3 pb-4">
        {/* In the rail this sits on the dark-green sidebar, so the label reads in the sidebar
            foreground (near-white), not the dark on-surface ink. */}
        <p
          className="truncate type-body-sm font-semibold text-sidebar-foreground"
          title={active.name}
        >
          {active.name}
        </p>
        <Link
          href="/start?add=1"
          className="mt-1 inline-flex items-center gap-1 type-caption text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
        >
          <Plus size={13} aria-hidden />
          {en.team.addFarm}
        </Link>
      </div>
    );
  }

  function select(id: string) {
    if (id === active?.id) return;
    startTransition(async () => {
      await setActiveFarmAction(id);
      router.refresh();
    });
  }

  return (
    <div className="px-2.5 pb-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-auto w-full justify-between gap-2 rounded-xl border-outline-variant bg-surface-container-lowest px-3 py-2 text-left shadow-[var(--shadow-soft)] hover:bg-surface-container-low"
          >
            <span
              className="min-w-0 flex-1 truncate type-body-sm font-semibold text-on-surface"
              title={active.name}
            >
              {active.name}
            </span>
            <ChevronsUpDown size={15} aria-hidden className="shrink-0 text-on-surface-variant" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 overflow-auto"
        >
          <DropdownMenuLabel className="type-label-caps text-on-surface-variant/70">
            {en.team.switcherHeading}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={active.id} onValueChange={select}>
            {farms.map((f) => (
              <DropdownMenuRadioItem key={f.id} value={f.id} className="type-body-sm">
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {/* Start or join ANOTHER farm. /start?add=1 always shows the Create-vs-Join fork. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/start?add=1" className="type-body-sm text-on-surface-variant">
              <Plus size={15} aria-hidden className="shrink-0" />
              <span>{en.team.addFarm}</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
