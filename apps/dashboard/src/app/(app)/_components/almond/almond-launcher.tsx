"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AlmondChat } from "./almond-chat";

export function AlmondLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-[var(--shadow-soft)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:bottom-6",
          open && "pointer-events-none scale-95 opacity-0",
        )}
        aria-label="Open Almond"
      >
        <MessageCircle size={22} aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 p-3 backdrop-blur-sm lg:p-6">
          <div className="flex h-full w-full max-w-2xl flex-col">
            <AlmondChat
              className="min-h-0 flex-1"
              header={
                <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  <X size={16} aria-hidden />
                  Close
                </Button>
              }
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
