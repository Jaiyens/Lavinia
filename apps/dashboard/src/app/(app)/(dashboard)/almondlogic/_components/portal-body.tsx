"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Renders the hullers/handlers sidebar ONLY for the huller-scoped portal screens (Home, Grower
// Details, Runs, Reports). The migrated farm-wide views (Cost per pound, Reconcile, Deliveries) are
// not scoped to a single huller, so they render full-width without the sidebar.
const SIDEBAR_ROUTES = new Set([
  "/almondlogic",
  "/almondlogic/grower",
  "/almondlogic/runs",
  "/almondlogic/reports",
]);

export function PortalBody({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  if (!SIDEBAR_ROUTES.has(pathname)) {
    return <div className="mt-6 min-w-0">{children}</div>;
  }
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
      {sidebar}
      <main className="min-w-0">{children}</main>
    </div>
  );
}
