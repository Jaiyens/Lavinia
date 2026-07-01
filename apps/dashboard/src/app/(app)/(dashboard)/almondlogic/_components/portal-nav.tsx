"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

// The Almond Logic sub-nav, reframed around Gagan's production worksheet. The worksheet ("Crop
// position") is the front door; Cost per pound and Reconcile are the analytics built on it; the five
// portal-mirror screens (Home / Grower / Runs / Reports / Deliveries) are grouped under "Source data"
// as the raw drill-down. The active ?hullerId & ?cropYear context carries across tabs so a selected
// huller + season follows the operator from the worksheet down into the source screens.
const PRIMARY = [
  { href: "/almondlogic", label: "Crop position" },
  { href: "/almondlogic/cost", label: "Cost / lb" },
  { href: "/almondlogic/reconcile", label: "Reconcile" },
] as const;

const SOURCE = [
  { href: "/almondlogic/home", label: "Home" },
  { href: "/almondlogic/grower", label: "Grower Details" },
  { href: "/almondlogic/runs", label: "Runs" },
  { href: "/almondlogic/reports", label: "Reports" },
  { href: "/almondlogic/deliveries", label: "Deliveries" },
] as const;

export function PortalNav() {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  const withQs = (href: string): string => (qs ? `${href}?${qs}` : href);

  const tab = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={withQs(href)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 type-label-caps transition-colors",
          active
            ? "border-primary text-on-surface"
            : "border-transparent text-on-surface-variant hover:text-on-surface",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto border-b border-outline-variant"
      aria-label="Almond Logic sections"
    >
      {PRIMARY.map((x) => tab(x.href, x.label))}
      <span aria-hidden className="mx-2 h-4 w-px shrink-0 bg-outline-variant" />
      <span className="whitespace-nowrap px-2 type-label-caps text-on-surface-variant/70">Source data</span>
      {SOURCE.map((x) => tab(x.href, x.label))}
    </nav>
  );
}
