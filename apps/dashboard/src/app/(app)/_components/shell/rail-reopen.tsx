"use client";

import { PanelLeft } from "lucide-react";
import { Button, useSidebar } from "@/components/ui";

// The floating "show navigation" button. Visible only when the left rail is collapsed (desktop),
// so the operator can always bring the hidden rail back. Hiding is done from the trigger in the rail
// header; this is its counterpart. Mobile uses the AgentTabBar, so this is lg-only.
export function RailReopen() {
  const { open, toggleSidebar } = useSidebar();
  if (open) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleSidebar}
      aria-label="Show navigation"
      className="fixed left-3 top-3 z-30 hidden shadow-e2 lg:inline-flex"
    >
      <PanelLeft aria-hidden />
    </Button>
  );
}
