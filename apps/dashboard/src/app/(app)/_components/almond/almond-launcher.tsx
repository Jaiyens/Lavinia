"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button, Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AlmondChat } from "./almond-chat";

export function AlmondLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          className={cn(
            "fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full p-0 shadow-[var(--shadow-soft)] transition-transform hover:scale-105 lg:bottom-6",
            open && "pointer-events-none scale-95 opacity-0",
          )}
          aria-label="Open Almond"
        >
          <MessageCircle size={22} aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton={false}
        className="inset-y-3 right-3 h-auto w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden border-l-0 bg-transparent p-0 shadow-none sm:inset-y-6 sm:right-6 sm:w-[42rem] sm:max-w-[calc(100vw-3rem)]"
      >
        <AlmondChat
          className="min-h-0 flex-1"
          header={
            <SheetClose asChild>
              <Button type="button" variant="secondary" size="sm">
                <X size={16} aria-hidden />
                Close
              </Button>
            </SheetClose>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
