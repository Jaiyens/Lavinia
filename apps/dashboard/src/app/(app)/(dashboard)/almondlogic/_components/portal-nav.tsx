"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

// The portal screen sub-nav (Home / Grower Details / Runs / Reports), mirroring the Almond Logic
// portal sections. Preserves the active ?hullerId & ?cropYear across tabs so the selected context
// carries between screens.
const TABS = [
  { href: "/almondlogic", label: "Home" },
  { href: "/almondlogic/grower", label: "Grower Details" },
  { href: "/almondlogic/runs", label: "Runs" },
  { href: "/almondlogic/reports", label: "Reports" },
  { href: "/almondlogic/deliveries", label: "Deliveries" },
  { href: "/almondlogic/cost", label: "Cost / lb" },
  { href: "/almondlogic/reconcile", label: "Reconcile" },
] as const;

export function PortalNav() {
  const pathname = usePathname();
  const qs = useSearchParams().toString();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-outline-variant" aria-label="Almond Logic sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={qs ? `${tab.href}?${qs}` : tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 type-label-caps transition-colors",
              active
                ? "border-primary text-on-surface"
                : "border-transparent text-on-surface-variant hover:text-on-surface",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
